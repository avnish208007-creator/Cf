import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GoogleGenAI } from '@google/genai';
import { JobStage, JobStatus } from './types';

const execFileAsync = promisify(execFile);
const storage = getStorage();

const tmpDir = path.resolve(process.cwd(), 'tmp', 'media');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

export class PipelineWorker {
  async processSource(workspaceId: string, sourceVideoId: string, jobId: string) {
    const jobRef = doc(db, 'workspaces', workspaceId, 'jobs', jobId);
    const sourceRef = doc(db, 'workspaces', workspaceId, 'sources', sourceVideoId);

    const updateJob = async (stage: JobStage, progress: number, status: JobStatus = 'processing', error?: string) => {
      try {
        await updateDoc(jobRef, {
          stage,
          progress,
          status,
          error: error || null,
          updatedAt: new Date().toISOString(),
          ...(status === 'completed' || status === 'failed' ? { completedAt: new Date().toISOString() } : {}),
        });
      } catch (e) {
        console.error('[PipelineWorker] Failed to update job status:', e);
      }
    };

    try {
      // 1. Fetch Source
      const sourceSnap = await getDoc(sourceRef);
      if (!sourceSnap.exists()) {
        throw new Error('Source video not found in Firestore.');
      }
      const sourceData = sourceSnap.data();
      const youtubeUrl = sourceData.youtubeUrl || `https://www.youtube.com/watch?v=${sourceData.youtubeVideoId}`;

      await updateJob('downloading', 10, 'processing');
      await updateDoc(sourceRef, { status: 'processing', updatedAt: new Date().toISOString() });

      // 2. Download via yt-dlp
      const ytDlpPath = path.resolve(process.cwd(), 'bin', 'yt-dlp');
      const executable = fs.existsSync(ytDlpPath) ? ytDlpPath : 'yt-dlp';
      const sourceMp4 = path.resolve(tmpDir, `${jobId}_source.mp4`);

      console.log(`[PipelineWorker] Downloading ${youtubeUrl} to ${sourceMp4}`);
      try {
        await execFileAsync(executable, [
          '-f',
          'bestvideo[ext=mp4]+bestaudio[ext=mp4]/best[ext=mp4]/best',
          '-o',
          sourceMp4,
          youtubeUrl,
        ], { timeout: 120000 });
      } catch (dlErr: any) {
        console.warn('[PipelineWorker] yt-dlp primary format failed, trying fallback:', dlErr.message);
        await execFileAsync(executable, ['-o', sourceMp4, youtubeUrl], { timeout: 120000 });
      }

      if (!fs.existsSync(sourceMp4) || fs.statSync(sourceMp4).size < 1000) {
        throw new Error('Downloaded video file is missing or too small.');
      }

      await updateJob('extracting_media', 30, 'processing');

      // 3. Extract media info with ffprobe
      const ffprobePath = 'ffprobe';
      let durationSeconds = 60;
      try {
        const { stdout } = await execFileAsync(ffprobePath, [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          sourceMp4,
        ]);
        const probe = JSON.parse(stdout);
        if (probe.format && probe.format.duration) {
          durationSeconds = Math.round(parseFloat(probe.format.duration));
        }
      } catch (probeErr) {
        console.warn('[PipelineWorker] ffprobe warning:', probeErr);
      }

      await updateJob('transcribing', 45, 'processing');

      // 4. Transcription & Moment Detection via Gemini AI
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not set.');
      }

      const ai = new GoogleGenAI({ apiKey });
      const modelName = 'gemini-2.5-flash';

      const prompt = `You are an expert video content analyst. Analyze the video titled "${sourceData.title}" (${durationSeconds} seconds long, niche: ${sourceData.niche || 'General'}).
Return a JSON array of 1 to 3 standout short-form moments (TikTok / YouTube Shorts / Reels) with exact start and end timestamps (in seconds, clamping between 0 and ${durationSeconds}, duration between 15 and 50 seconds).
Each item in the JSON array must have:
- "start": number
- "end": number
- "hook": string (catchy title / hook text for the short)
- "summary": string (1 sentence summary)
- "reason": string (why this is engaging)
- "score": number (80 to 98)

Return ONLY valid JSON with no markdown formatting or extra text.`;

      let moments: any[] = [];
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });
        const text = response.text || '[]';
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        moments = JSON.parse(cleanJson);
      } catch (geminiErr: any) {
        console.warn('[PipelineWorker] Gemini moment selection failed, generating deterministic fallback moment:', geminiErr);
        const segDuration = Math.min(30, Math.floor(durationSeconds / 2));
        moments = [
          {
            start: 5,
            end: 5 + segDuration,
            hook: sourceData.title || 'Key Highlight',
            summary: sourceData.description || 'Important excerpt from the video.',
            reason: 'High engagement potential',
            score: 88,
          },
        ];
      }

      if (!Array.isArray(moments) || moments.length === 0) {
        moments = [
          {
            start: 0,
            end: Math.min(30, durationSeconds),
            hook: sourceData.title || 'Featured Highlight',
            summary: 'Auto-extracted video segment.',
            reason: 'Primary video clip',
            score: 85,
          },
        ];
      }

      await updateJob('finding_moments', 65, 'processing');

      const candidates: any[] = [];
      const clips: any[] = [];

      for (let i = 0; i < moments.length; i++) {
        const m = moments[i];
        const candidateId = 'cand_' + Math.random().toString(36).substring(2, 9);
        const clipId = 'clip_' + Math.random().toString(36).substring(2, 9);
        const startSec = Math.max(0, Math.floor(Number(m.start) || 0));
        const endSec = Math.min(durationSeconds, Math.max(startSec + 10, Math.floor(Number(m.end) || startSec + 30)));
        const segDuration = endSec - startSec;

        const candidateObj = {
          id: candidateId,
          sourceVideoId,
          sourceTitle: sourceData.title,
          hook: m.hook || 'Compelling Clip',
          summary: m.summary || m.reason || '',
          start: startSec,
          end: endSec,
          duration: `${segDuration}s`,
          durationSeconds: segDuration,
          score: m.score || 88,
          status: 'approved',
          transcript: [{ start: startSec, end: endSec, text: m.summary || m.hook }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        candidates.push(candidateObj);
        await setDoc(doc(db, 'workspaces', workspaceId, 'candidates', candidateId), candidateObj);

        await updateJob('rendering', 75 + i * 5, 'processing');

        // 5. Render Clip with FFmpeg (9:16 vertical crop + H.264 + AAC + faststart)
        const clipMp4 = path.resolve(tmpDir, `${jobId}_clip_${i}.mp4`);
        const thumbJpg = path.resolve(tmpDir, `${jobId}_thumb_${i}.jpg`);

        const ffmpegPath = 'ffmpeg';
        try {
          await execFileAsync(ffmpegPath, [
            '-ss', String(startSec),
            '-i', sourceMp4,
            '-t', String(segDuration),
            '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            clipMp4,
          ], { timeout: 90000 });
        } catch (ffErr) {
          console.error('[PipelineWorker] FFmpeg cut failed:', ffErr);
          throw new Error('Video rendering failed during FFmpeg processing.');
        }

        if (!fs.existsSync(clipMp4) || fs.statSync(clipMp4).size < 1000) {
          throw new Error('Rendered clip MP4 file is invalid or missing.');
        }

        // Generate thumbnail
        try {
          await execFileAsync(ffmpegPath, [
            '-ss', '2',
            '-i', clipMp4,
            '-frames:v', '1',
            thumbJpg,
          ]);
        } catch (thumbErr) {
          console.warn('[PipelineWorker] Thumbnail extraction warning:', thumbErr);
        }

        await updateJob('uploading', 90, 'processing');

        // 6. Upload to Firebase Storage
        let videoUrl = '';
        let thumbnailUrl = '';

        try {
          const videoStorageRef = ref(storage, `workspaces/${workspaceId}/clips/${clipId}/video.mp4`);
          const videoBuffer = fs.readFileSync(clipMp4);
          await uploadBytes(videoStorageRef, videoBuffer, { contentType: 'video/mp4' });
          videoUrl = await getDownloadURL(videoStorageRef);

          if (fs.existsSync(thumbJpg)) {
            const thumbStorageRef = ref(storage, `workspaces/${workspaceId}/clips/${clipId}/thumbnail.jpg`);
            const thumbBuffer = fs.readFileSync(thumbJpg);
            await uploadBytes(thumbStorageRef, thumbBuffer, { contentType: 'image/jpeg' });
            thumbnailUrl = await getDownloadURL(thumbStorageRef);
          } else {
            thumbnailUrl = videoUrl;
          }
        } catch (storageErr: any) {
          console.error('[PipelineWorker] Firebase Storage upload error:', storageErr);
          throw new Error(`Failed to upload media to Firebase Storage: ${storageErr.message}`);
        }

        const clipObj = {
          id: clipId,
          candidateId,
          sourceVideoId,
          workspaceId,
          title: m.hook || sourceData.title,
          hookText: m.hook || '',
          videoUrl,
          thumbnailUrl,
          duration: `${segDuration}s`,
          durationSeconds: segDuration,
          width: 1080,
          height: 1920,
          aspectRatio: '9:16',
          status: 'ready',
          score: m.score || 88,
          caption: m.summary || '',
          hashtags: ['#shorts', '#viral', '#' + (sourceData.niche || 'content').replace(/[^a-zA-Z0-9]/g, '')],
          processingJobId: jobId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        clips.push(clipObj);
        await setDoc(doc(db, 'workspaces', workspaceId, 'clips', clipId), clipObj);

        // Clean temp clip files
        try {
          if (fs.existsSync(clipMp4)) fs.unlinkSync(clipMp4);
          if (fs.existsSync(thumbJpg)) fs.unlinkSync(thumbJpg);
        } catch {}
      }

      // Cleanup source temp file
      try {
        if (fs.existsSync(sourceMp4)) fs.unlinkSync(sourceMp4);
      } catch {}

      await updateDoc(sourceRef, { status: 'analyzed', updatedAt: new Date().toISOString() });
      await updateJob('completed', 100, 'completed');
      console.log(`[PipelineWorker] Job ${jobId} completed successfully. Generated ${clips.length} clips.`);
    } catch (err: any) {
      console.error(`[PipelineWorker] Job ${jobId} failed:`, err);
      await updateJob('failed', 100, 'failed', err.message || 'Unknown processing error');
      try {
        await updateDoc(sourceRef, { status: 'failed', updatedAt: new Date().toISOString() });
      } catch {}
    }
  }
}
