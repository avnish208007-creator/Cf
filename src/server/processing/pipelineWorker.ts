import fs from 'fs';
import path from 'path';
import { execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { db, storage } from '../../lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GoogleGenAI } from '@google/genai';
import { JobStage, JobStatus } from './types';
import { resolveFfmpeg, resolveFfprobe } from '../utils/binaries';
import { downloadYouTubeSource } from '../utils/youtubeDownloader';
import { extractTranscript } from './transcriptService';

const execFileAsync = promisify(execFile);

const tmpDir = path.resolve(process.cwd(), 'tmp', 'media');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

function parseSeconds(val: string | number): number {
  if (typeof val === 'number') return Math.max(0, Math.floor(val));
  const str = String(val).trim();
  if (str.includes(':')) {
    const parts = str.split(':').map((p) => Number(p) || 0);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : Math.max(0, Math.floor(parsed));
}

function formatSeconds(sec: number): string {
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export class PipelineWorker {
  private cancelledJobs: Set<string> = new Set();
  private activeProcesses: Map<string, ChildProcess> = new Map();

  public cancelJob(jobId: string) {
    this.cancelledJobs.add(jobId);
    const proc = this.activeProcesses.get(jobId);
    if (proc) {
      try {
        proc.kill('SIGKILL');
      } catch {}
      this.activeProcesses.delete(jobId);
    }
    console.log(`[PipelineWorker] Job ${jobId} cancelled and active processes terminated.`);
  }

  private isCancelled(jobId: string): boolean {
    return this.cancelledJobs.has(jobId);
  }

  private registerProcess(jobId: string, proc: ChildProcess) {
    this.activeProcesses.set(jobId, proc);
    if (this.isCancelled(jobId)) {
      try {
        proc.kill('SIGKILL');
      } catch {}
    }
  }

  private unregisterProcess(jobId: string) {
    this.activeProcesses.delete(jobId);
  }

  /**
   * Complete source processing pipeline:
   * 1. Download YouTube source video via yt-dlp
   * 2. Probe media duration and streams via ffprobe
   * 3. Extract real timestamped transcript (YouTube captions / audio transcription)
   * 4. Select moments via Gemini strictly grounded in the transcript
   * 5. Cut vertical 9:16 clips via FFmpeg
   * 6. Validate output clips with ffprobe
   * 7. Upload to Firebase Storage
   * 8. Persist candidate and clip documents to Firestore
   */
  async processSource(workspaceId: string, sourceVideoId: string, jobId: string) {
    const jobRef = doc(db, 'workspaces', workspaceId, 'jobs', jobId);
    const sourceRef = doc(db, 'workspaces', workspaceId, 'sources', sourceVideoId);

    const updateJob = async (
      stage: JobStage,
      progress: number,
      status: JobStatus = 'processing',
      error?: string,
      errorCode?: string
    ) => {
      try {
        if (this.isCancelled(jobId) && status === 'completed') {
          status = 'cancelled';
        }
        await updateDoc(jobRef, {
          stage,
          progress,
          status,
          error: error || null,
          errorCode: errorCode || null,
          updatedAt: new Date().toISOString(),
          ...(status === 'completed' || status === 'failed' || status === 'cancelled'
            ? { completedAt: new Date().toISOString() }
            : {}),
        });
      } catch (e) {
        console.error(`[PipelineWorker] Failed to update job status for ${jobId}:`, e);
      }
    };

    let sourceMp4 = '';
    const tempFiles: string[] = [];

    try {
      if (this.isCancelled(jobId)) {
        await updateJob('failed', 0, 'cancelled', 'Job was cancelled before execution.');
        return;
      }

      // 1. Fetch Source
      const sourceSnap = await getDoc(sourceRef);
      if (!sourceSnap.exists()) {
        throw new Error(`Source video '${sourceVideoId}' not found in Firestore.`);
      }
      const sourceData = sourceSnap.data();
      const youtubeUrl =
        sourceData.youtubeUrl || `https://www.youtube.com/watch?v=${sourceData.youtubeVideoId || sourceVideoId}`;

      await updateJob('downloading', 10, 'processing');
      await updateDoc(sourceRef, { status: 'processing', updatedAt: new Date().toISOString() });

      if (this.isCancelled(jobId)) {
        await updateJob('failed', 10, 'cancelled', 'Job cancelled.');
        return;
      }

      // 2. Download source via yt-dlp with process tracking
      const downloadedMedia = await downloadYouTubeSource(youtubeUrl, tmpDir, jobId, (proc) => {
        this.registerProcess(jobId, proc);
      });
      this.unregisterProcess(jobId);

      sourceMp4 = downloadedMedia.localPath;
      tempFiles.push(sourceMp4);

      let durationSeconds = downloadedMedia.durationSeconds;
      if (durationSeconds <= 0) {
        throw new Error('Could not determine source video duration.');
      }

      if (this.isCancelled(jobId)) {
        await updateJob('failed', 25, 'cancelled', 'Job cancelled.');
        return;
      }

      await updateJob('extracting_media', 30, 'processing');

      // 3. Extract real timestamped transcript
      await updateJob('transcribing', 45, 'processing');
      const transcriptResult = await extractTranscript(youtubeUrl, sourceMp4, tmpDir, jobId);

      if (!transcriptResult.segments || transcriptResult.segments.length === 0) {
        throw new Error('Transcription produced no valid segments.');
      }

      if (this.isCancelled(jobId)) {
        await updateJob('failed', 50, 'cancelled', 'Job cancelled.');
        return;
      }

      // 4. Moment Detection with Gemini AI using the REAL timestamped transcript
      await updateJob('finding_moments', 60, 'processing');

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not configured.');
      }

      const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      console.log(`[PipelineWorker] Running moment detection with configured model "${modelName}"...`);

      const prompt = `You are an expert video content analyst and viral short-form editor.
Here is the video title: "${sourceData.title || 'Untitled'}"
Total video duration: ${durationSeconds} seconds.

Below is the REAL timestamped transcript of the video:
---
${transcriptResult.formattedTranscript.slice(0, 15000)}
---

Task:
Identify 1 to 3 standout high-retention short-form moments (TikTok / YouTube Shorts / Reels).
CRITICAL RULES:
1. Every moment's "start" and "end" timestamps (in seconds) MUST be grounded directly in the provided transcript.
2. 0 <= "start" < "end" <= ${durationSeconds}.
3. The duration ("end" - "start") must be between 15 and 55 seconds.
4. Do NOT invent timestamps or moments outside the provided transcript.

Return a JSON array of objects with the exact schema:
[
  {
    "start": number,
    "end": number,
    "hook": string,
    "summary": string,
    "reason": string,
    "score": number
  }
]

Return ONLY valid JSON. No commentary, no markdown formatting.`;

      let moments: any[] = [];
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });

        const text = response.text || '[]';
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (Array.isArray(parsed) && parsed.length > 0) {
          moments = parsed.filter((m: any) => {
            const s = Number(m.start);
            const e = Number(m.end);
            const dur = e - s;
            return !isNaN(s) && !isNaN(e) && s >= 0 && e > s && e <= durationSeconds && dur >= 15 && dur <= 55;
          });
        }
      } catch (geminiErr: any) {
        console.error(`[PipelineWorker] Gemini model '${modelName}' error:`, geminiErr);
        throw new Error(`Gemini moment detection failed with model '${modelName}': ${geminiErr.message || geminiErr}`);
      }

      if (moments.length === 0) {
        throw new Error(`Gemini moment detection failed to extract valid timestamped moments (15-55s) grounded in transcript.`);
      }

      if (this.isCancelled(jobId)) {
        await updateJob('failed', 65, 'cancelled', 'Job cancelled.');
        return;
      }

      const ffmpegExecutable = resolveFfmpeg();
      const ffprobeExecutable = resolveFfprobe();
      const candidates: any[] = [];
      const clips: any[] = [];

      // 5. Process each candidate moment and render vertical short
      for (let i = 0; i < moments.length; i++) {
        if (this.isCancelled(jobId)) {
          await updateJob('failed', 70 + i * 5, 'cancelled', 'Job cancelled.');
          return;
        }

        const m = moments[i];
        const candidateId = 'cand_' + Math.random().toString(36).substring(2, 9);
        const clipId = 'clip_' + Math.random().toString(36).substring(2, 9);
        const startSec = Math.max(0, Math.floor(Number(m.start) || 0));
        const endSec = Math.min(durationSeconds, Math.max(startSec + 15, Math.floor(Number(m.end) || startSec + 30)));
        const segDuration = endSec - startSec;

        const candidateObj = {
          id: candidateId,
          workspaceId,
          sourceVideoId,
          sourceTitle: sourceData.title || 'Untitled Video',
          channelTitle: sourceData.channelTitle || 'YouTube Channel',
          startTime: formatSeconds(startSec),
          endTime: formatSeconds(endSec),
          duration: `${segDuration}s`,
          durationSeconds: segDuration,
          hook: m.hook || sourceData.title || 'Key Breakthrough',
          summary: m.summary || m.reason || '',
          score: Math.min(99, Math.max(60, Number(m.score) || 85)),
          status: 'detected',
          factors: {
            hookStrength: Number(m.score) || 85,
            standaloneContext: 88,
            pacing: 90,
            transcriptText: m.summary || m.hook,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        candidates.push(candidateObj);
        await setDoc(doc(db, 'workspaces', workspaceId, 'candidates', candidateId), candidateObj);

        await updateJob('rendering', 70 + i * 8, 'processing');

        const clipMp4 = path.resolve(tmpDir, `${jobId}_clip_${i}.mp4`);
        const thumbJpg = path.resolve(tmpDir, `${jobId}_thumb_${i}.jpg`);
        tempFiles.push(clipMp4, thumbJpg);

        try {
          const ffmpegProcess = execFile(ffmpegExecutable, [
            '-y',
            '-ss', String(startSec),
            '-i', sourceMp4,
            '-t', String(segDuration),
            '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            clipMp4,
          ]);

          this.registerProcess(jobId, ffmpegProcess);

          await new Promise((resolve, reject) => {
            ffmpegProcess.on('error', (err) => reject(err));
            ffmpegProcess.on('close', (code) => {
              if (code === 0) resolve(0);
              else reject(new Error(`FFmpeg exited with code ${code}`));
            });
          });
          this.unregisterProcess(jobId);
        } catch (ffErr: any) {
          console.error('[PipelineWorker] FFmpeg cut failed:', ffErr);
          throw new Error(`Video rendering failed during FFmpeg cut: ${ffErr?.message || ffErr}`);
        }

        if (!fs.existsSync(clipMp4) || fs.statSync(clipMp4).size < 1000) {
          throw new Error('Rendered clip MP4 file is invalid or missing.');
        }

        try {
          const { stdout } = await execFileAsync(ffprobeExecutable, [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            clipMp4,
          ]);
          const probe = JSON.parse(stdout);
          const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
          if (!videoStream || Number(videoStream.width) !== 1080 || Number(videoStream.height) !== 1920) {
            throw new Error(`Rendered video does not meet 1080x1920 specification.`);
          }
        } catch (validationErr: any) {
          console.error('[PipelineWorker] FFprobe validation failed:', validationErr);
          throw new Error(`FFprobe validation failed: ${validationErr.message}`);
        }

        try {
          await execFileAsync(ffmpegExecutable, [
            '-y',
            '-ss', '1',
            '-i', clipMp4,
            '-frames:v', '1',
            thumbJpg,
          ]);
        } catch {}

        if (this.isCancelled(jobId)) {
          await updateJob('failed', 88, 'cancelled', 'Job cancelled.');
          return;
        }

        await updateJob('uploading', 88 + i * 3, 'processing');

        let videoUrl = '';
        let thumbnailUrl = '';

        try {
          const videoStorageRef = ref(storage, `workspaces/${workspaceId}/clips/${clipId}/video.mp4`);
          const videoBuffer = new Uint8Array(fs.readFileSync(clipMp4));
          await uploadBytes(videoStorageRef, videoBuffer, { contentType: 'video/mp4' });
          videoUrl = await getDownloadURL(videoStorageRef);

          if (fs.existsSync(thumbJpg)) {
            const thumbStorageRef = ref(storage, `workspaces/${workspaceId}/clips/${clipId}/thumbnail.jpg`);
            const thumbBuffer = new Uint8Array(fs.readFileSync(thumbJpg));
            await uploadBytes(thumbStorageRef, thumbBuffer, { contentType: 'image/jpeg' });
            thumbnailUrl = await getDownloadURL(thumbStorageRef);
          } else {
            thumbnailUrl = videoUrl;
          }
        } catch (storageErr: any) {
          console.error('[PipelineWorker] Firebase Storage upload error:', storageErr);
          throw new Error(`Firebase Storage upload failed: ${storageErr?.message || storageErr}`);
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
          score: Math.min(99, Math.max(60, Number(m.score) || 85)),
          caption: m.summary || '',
          hashtags: ['#shorts', '#viral'],
          processingJobId: jobId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        clips.push(clipObj);
        await setDoc(doc(db, 'workspaces', workspaceId, 'clips', clipId), clipObj);
      }

      if (this.isCancelled(jobId)) {
        await updateJob('failed', 100, 'cancelled', 'Job cancelled.');
        return;
      }

      await updateDoc(sourceRef, {
        status: 'analyzed',
        candidatesCount: candidates.length,
        updatedAt: new Date().toISOString(),
      });

      await updateJob('completed', 100, 'completed');
      console.log(`[PipelineWorker] Job ${jobId} completed successfully with ${clips.length} clips.`);
    } catch (err: any) {
      console.error(`[PipelineWorker] Job ${jobId} failed:`, err);
      const isDl = err.message?.toLowerCase().includes('youtube') || err.message?.toLowerCase().includes('download');
      const isAi = err.message?.toLowerCase().includes('gemini') || err.message?.toLowerCase().includes('moment');
      const isStore = err.message?.toLowerCase().includes('storage') || err.message?.toLowerCase().includes('upload');

      const errorCode = isDl
        ? 'YOUTUBE_DOWNLOAD_FAILED'
        : isAi
        ? 'GEMINI_MOMENT_DETECTION_FAILED'
        : isStore
        ? 'STORAGE_UPLOAD_FAILED'
        : 'PROCESSING_FAILED';

      await updateJob('failed', 100, 'failed', err.message || 'Unknown processing error', errorCode);

      try {
        await updateDoc(sourceRef, { status: 'failed', updatedAt: new Date().toISOString() });
      } catch {}
    } finally {
      for (const f of tempFiles) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {}
      }
      this.cancelledJobs.delete(jobId);
    }
  }

  /**
   * Dedicated candidate clip rendering:
   * Renders a specific candidate moment from the source media without re-analyzing the source.
   */
  async renderCandidate(
    workspaceId: string,
    sourceVideoId: string,
    candidateId: string,
    startTime: string | number,
    endTime: string | number,
    jobId: string
  ) {
    const jobRef = doc(db, 'workspaces', workspaceId, 'jobs', jobId);
    const candidateRef = doc(db, 'workspaces', workspaceId, 'candidates', candidateId);
    const sourceRef = doc(db, 'workspaces', workspaceId, 'sources', sourceVideoId);

    const updateJob = async (
      stage: JobStage,
      progress: number,
      status: JobStatus = 'processing',
      error?: string,
      errorCode?: string
    ) => {
      try {
        if (this.isCancelled(jobId) && status === 'completed') {
          status = 'cancelled';
        }
        await updateDoc(jobRef, {
          stage,
          progress,
          status,
          error: error || null,
          errorCode: errorCode || null,
          updatedAt: new Date().toISOString(),
          ...(status === 'completed' || status === 'failed' || status === 'cancelled'
            ? { completedAt: new Date().toISOString() }
            : {}),
        });
      } catch (e) {
        console.error(`[PipelineWorker] Failed to update candidate render job ${jobId}:`, e);
      }
    };

    const tempFiles: string[] = [];

    try {
      if (this.isCancelled(jobId)) {
        await updateJob('failed', 0, 'cancelled', 'Job cancelled before execution.');
        return;
      }

      await updateJob('downloading', 15, 'processing');

      const [sourceSnap, candSnap] = await Promise.all([getDoc(sourceRef), getDoc(candidateRef)]);
      if (!sourceSnap.exists()) {
        throw new Error(`Source video '${sourceVideoId}' not found.`);
      }
      const sourceData = sourceSnap.data();
      const candData = candSnap.exists() ? candSnap.data() : {};

      const youtubeUrl =
        sourceData.youtubeUrl || `https://www.youtube.com/watch?v=${sourceData.youtubeVideoId || sourceVideoId}`;

      const downloadedMedia = await downloadYouTubeSource(youtubeUrl, tmpDir, jobId, (proc) => {
        this.registerProcess(jobId, proc);
      });
      this.unregisterProcess(jobId);

      const sourceMp4 = downloadedMedia.localPath;
      tempFiles.push(sourceMp4);

      if (this.isCancelled(jobId)) {
        await updateJob('failed', 40, 'cancelled', 'Job cancelled.');
        return;
      }

      await updateJob('rendering', 50, 'processing');

      const startSec = parseSeconds(startTime || candData.startTime || 0);
      const endSec = parseSeconds(endTime || candData.endTime || startSec + 30);
      const segDuration = Math.max(15, endSec - startSec);

      const clipId = 'clip_' + Math.random().toString(36).substring(2, 9);
      const clipMp4 = path.resolve(tmpDir, `${jobId}_render_${clipId}.mp4`);
      const thumbJpg = path.resolve(tmpDir, `${jobId}_render_thumb_${clipId}.jpg`);
      tempFiles.push(clipMp4, thumbJpg);

      const ffmpegExecutable = resolveFfmpeg();
      const ffprobeExecutable = resolveFfprobe();

      const ffmpegProcess = execFile(ffmpegExecutable, [
        '-y',
        '-ss', String(startSec),
        '-i', sourceMp4,
        '-t', String(segDuration),
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        clipMp4,
      ]);

      this.registerProcess(jobId, ffmpegProcess);

      await new Promise((resolve, reject) => {
        ffmpegProcess.on('error', (err) => reject(err));
        ffmpegProcess.on('close', (code) => {
          if (code === 0) resolve(0);
          else reject(new Error(`FFmpeg exited with code ${code}`));
        });
      });
      this.unregisterProcess(jobId);

      if (!fs.existsSync(clipMp4) || fs.statSync(clipMp4).size < 1000) {
        throw new Error('Rendered candidate clip MP4 is invalid or missing.');
      }

      const { stdout } = await execFileAsync(ffprobeExecutable, [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        clipMp4,
      ]);
      const probe = JSON.parse(stdout);
      const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
      if (!videoStream || Number(videoStream.width) !== 1080 || Number(videoStream.height) !== 1920) {
        throw new Error('Rendered video does not meet 1080x1920 specification.');
      }

      try {
        await execFileAsync(ffmpegExecutable, [
          '-y',
          '-ss', '1',
          '-i', clipMp4,
          '-frames:v', '1',
          thumbJpg,
        ]);
      } catch {}

      if (this.isCancelled(jobId)) {
        await updateJob('failed', 80, 'cancelled', 'Job cancelled.');
        return;
      }

      await updateJob('uploading', 85, 'processing');

      const videoStorageRef = ref(storage, `workspaces/${workspaceId}/clips/${clipId}/video.mp4`);
      const videoBuffer = new Uint8Array(fs.readFileSync(clipMp4));
      await uploadBytes(videoStorageRef, videoBuffer, { contentType: 'video/mp4' });
      const videoUrl = await getDownloadURL(videoStorageRef);

      let thumbnailUrl = videoUrl;
      if (fs.existsSync(thumbJpg)) {
        const thumbStorageRef = ref(storage, `workspaces/${workspaceId}/clips/${clipId}/thumbnail.jpg`);
        const thumbBuffer = new Uint8Array(fs.readFileSync(thumbJpg));
        await uploadBytes(thumbStorageRef, thumbBuffer, { contentType: 'image/jpeg' });
        thumbnailUrl = await getDownloadURL(thumbStorageRef);
      }

      const clipObj = {
        id: clipId,
        candidateId,
        sourceVideoId,
        workspaceId,
        title: candData.hook || sourceData.title || 'Vertical Short',
        hookText: candData.hook || '',
        videoUrl,
        thumbnailUrl,
        duration: `${segDuration}s`,
        durationSeconds: segDuration,
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
        status: 'ready',
        score: candData.score || 85,
        caption: candData.summary || '',
        hashtags: ['#shorts', '#viral'],
        processingJobId: jobId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'workspaces', workspaceId, 'clips', clipId), clipObj);

      await updateDoc(candidateRef, {
        status: 'rendered',
        renderedClipId: clipId,
        updatedAt: new Date().toISOString(),
      });

      if (this.isCancelled(jobId)) {
        await updateJob('failed', 100, 'cancelled', 'Job cancelled.');
        return;
      }

      await updateJob('completed', 100, 'completed');
      console.log(`[PipelineWorker] Candidate ${candidateId} rendered to clip ${clipId} successfully.`);
    } catch (err: any) {
      console.error(`[PipelineWorker] Candidate render failed for job ${jobId}:`, err);
      await updateJob('failed', 100, 'failed', err.message || 'Render failed', 'CANDIDATE_RENDER_FAILED');
    } finally {
      for (const f of tempFiles) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {}
      }
      this.cancelledJobs.delete(jobId);
    }
  }
}
