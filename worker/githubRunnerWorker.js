/**
 * GitHub Actions Runner Worker for ClipFlow V1 (Plain JavaScript)
 * Runs inside GitHub Actions runner:
 * 1. Validates required Firebase configuration (including named Firestore database).
 * 2. Resolves stream via dynamic Piped discovery & health check validation immediately before downloading.
 * 3. Streams media directly to disk, re-resolving streams if URLs expire, combining separate audio/video if necessary via FFmpeg muxing.
 * 4. Verifies using FFprobe that media contains valid video AND audio streams.
 * 5. Transcribes audio with local CPU Whisper.
 * 6. Detects candidate moments from transcript timestamps.
 * 7. Renders 9:16 vertical shorts with FFmpeg and verifies rendered clips contain valid video/audio.
 * 8. Uploads to Firebase Storage & Firestore with strict error handling and merge upserts.
 */
import fs from 'fs';
import path from 'path';
import { pipeline } from 'node:stream/promises';
import { execSync, execFileSync } from 'child_process';
import fetch from 'node-fetch';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { resolvePipedStream, pipedInstanceManager } from '../src/server/providers/pipedResolver.ts';

// 1. STARTUP CONFIGURATION VALIDATION
const requiredEnvVars = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'FIREBASE_DATABASE_ID',
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(`[GitHubRunnerWorker] FATAL CONFIGURATION ERROR: Missing required environment variable(s): ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const databaseId = process.env.FIREBASE_DATABASE_ID;
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, databaseId);
const storage = getStorage(app);

const jobId = process.env.JOB_ID;
const sourceVideoId = process.env.VIDEO_ID || process.env.SOURCE_VIDEO_ID;
const youtubeUrl = process.env.VIDEO_URL || process.env.YOUTUBE_URL;
const workspaceId = process.env.WORKSPACE_ID || 'default-workspace';

async function updateStatus(stage, progress, status = 'processing', error = null, errorCode = null) {
  if (!jobId) {
    throw new Error('[CONFIGURATION_ERROR] Cannot update status: JOB_ID environment variable is missing.');
  }

  const jobRef = doc(db, 'workspaces', workspaceId, 'jobs', jobId);
  const statusData = {
    id: jobId,
    workspaceId,
    status,
    stage,
    progress,
    error: error || null,
    errorCode: errorCode || null,
    updatedAt: new Date().toISOString(),
    ...(status === 'completed' || status === 'failed' ? { completedAt: new Date().toISOString() } : {}),
  };

  try {
    await setDoc(jobRef, statusData, { merge: true });
    console.log(`[GitHubRunnerWorker] Firestore job status updated -> Stage: ${stage}, Progress: ${progress}%, Status: ${status}`);
  } catch (err) {
    console.error(`[GitHubRunnerWorker] FATAL: Failed to update Firestore job status for job ${jobId} (Stage: ${stage}, Code: ${err.code || 'UNKNOWN'}):`, err.message);
    throw err;
  }
}

/**
 * Streaming Direct-to-Disk Download with Timeout & File Verification
 */
async function downloadFileStream(url, destPath, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ClipFlow-Worker/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const fileStream = fs.createWriteStream(destPath);
    await pipeline(res.body, fileStream);

    if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 10000) {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      throw new Error(`Downloaded file is empty or corrupted (<10KB) at ${destPath}`);
    }
  } catch (err) {
    clearTimeout(timer);
    if (fs.existsSync(destPath)) {
      try { fs.unlinkSync(destPath); } catch {}
    }
    throw err;
  }
}

/**
 * FFprobe Check for Video AND Audio Streams
 */
function verifyMediaHasVideoAndAudio(filePath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf8' }
    );
    const streams = output.trim().split(/\r?\n/).map((s) => s.trim().toLowerCase());
    const hasVideo = streams.includes('video');
    const hasAudio = streams.includes('audio');
    return { hasVideo, hasAudio };
  } catch (err) {
    console.warn(`[GitHubRunnerWorker] FFprobe inspection failed for ${filePath}:`, err.message);
    return { hasVideo: false, hasAudio: false };
  }
}

/**
 * Transcript-Based Moment Detector
 */
function detectMomentsFromTranscript(transcriptSegments, videoDuration) {
  if (!transcriptSegments || transcriptSegments.length === 0) {
    return [];
  }

  const candidates = [];
  const minDuration = 15;
  const maxDuration = 45;

  for (let i = 0; i < transcriptSegments.length; i += 3) {
    const startSegment = transcriptSegments[i];
    const startTime = startSegment.start;

    let endIdx = i;
    let endTime = startTime + 30;
    for (let j = i; j < transcriptSegments.length; j++) {
      if (transcriptSegments[j].end - startTime >= minDuration && transcriptSegments[j].end - startTime <= maxDuration) {
        endIdx = j;
        endTime = transcriptSegments[j].end;
      }
      if (transcriptSegments[j].end - startTime > maxDuration) break;
    }

    const windowSegments = transcriptSegments.slice(i, endIdx + 1);
    const windowText = windowSegments.map((s) => s.text).join(' ');
    const duration = endTime - startTime;

    if (duration >= minDuration && windowText.length > 30) {
      let score = 75;
      if (windowText.includes('?')) score += 6;
      if (windowText.includes('!') || windowText.includes('amazing') || windowText.includes('never') || windowText.includes('secret')) score += 8;
      if (windowText.length > 100) score += 5;

      score = Math.min(95, Math.max(70, score));

      candidates.push({
        id: `clip_${candidates.length + 1}`,
        sourceVideoId: sourceVideoId || 'source',
        startTime: Math.floor(startTime),
        endTime: Math.floor(endTime),
        duration: Math.floor(duration),
        hook: windowText.slice(0, 85) + '...',
        score,
        reason: 'Identified high-value segment from real transcript analysis',
      });

      if (candidates.length >= 3) break;
    }
  }

  if (candidates.length === 0 && transcriptSegments.length > 0) {
    const start = transcriptSegments[0].start;
    const end = Math.min(start + 30, videoDuration);
    candidates.push({
      id: 'clip_1',
      sourceVideoId: sourceVideoId || 'source',
      startTime: Math.floor(start),
      endTime: Math.floor(end),
      duration: Math.floor(end - start),
      hook: transcriptSegments[0].text.slice(0, 80) + '...',
      score: 82,
      reason: 'Opening highlights segment',
    });
  }

  return candidates;
}

async function run() {
  if (!jobId || !youtubeUrl) {
    console.error('[GitHubRunnerWorker] Missing required environment variables (JOB_ID, VIDEO_URL).');
    process.exit(1);
  }

  const tmpDir = path.resolve('/tmp', jobId);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. RESOLVING STREAM VIA DYNAMIC PIPED DISCOVERY & VALIDATION
    await updateStatus('resolving', 10, 'processing');
    let streamInfo = await resolvePipedStream(youtubeUrl);

    // 2. DOWNLOADING MEDIA (WITH EXPIRED STREAM RE-RESOLUTION RETRY)
    await updateStatus('downloading', 25, 'processing');
    const sourceVideoPath = path.resolve(tmpDir, 'source.mp4');
    const audioPath = path.resolve(tmpDir, 'audio.mp3');

    let acquisitionSuccess = false;

    for (let downloadAttempt = 0; downloadAttempt < 2 && !acquisitionSuccess; downloadAttempt++) {
      if (downloadAttempt > 0) {
        console.log('[GitHubRunnerWorker] Re-resolving stream due to download failure or expired URL...');
        streamInfo = await resolvePipedStream(youtubeUrl);
      }

      // Try downloading combined stream if present
      if (streamInfo.combinedUrl) {
        try {
          console.log(`[GitHubRunnerWorker] Downloading combined video+audio stream from ${streamInfo.instanceUsed}...`);
          await downloadFileStream(streamInfo.combinedUrl, sourceVideoPath);
          const { hasVideo, hasAudio } = verifyMediaHasVideoAndAudio(sourceVideoPath);
          if (hasVideo && hasAudio) {
            acquisitionSuccess = true;
            console.log('[GitHubRunnerWorker] Verified combined stream has both video and audio.');
          } else {
            console.warn(`[GitHubRunnerWorker] Combined stream check failed (video: ${hasVideo}, audio: ${hasAudio}). Falling back to separate streams.`);
            if (fs.existsSync(sourceVideoPath)) fs.unlinkSync(sourceVideoPath);
          }
        } catch (err) {
          console.warn(`[GitHubRunnerWorker] Combined stream download failed (${err.message}).`);
          pipedInstanceManager.recordFailure(streamInfo.instanceUsed, `Download failed: ${err.message}`);
        }
      }

      // Mux separate video and audio streams if combined stream was not available or invalid
      if (!acquisitionSuccess && streamInfo.videoStreamUrl && streamInfo.audioStreamUrl) {
        try {
          const videoOnlyPath = path.resolve(tmpDir, 'video_only.mp4');
          const audioOnlyPath = path.resolve(tmpDir, 'audio_only.m4a');

          console.log('[GitHubRunnerWorker] Downloading separate video stream...');
          await downloadFileStream(streamInfo.videoStreamUrl, videoOnlyPath);

          console.log('[GitHubRunnerWorker] Downloading separate audio stream...');
          await downloadFileStream(streamInfo.audioStreamUrl, audioOnlyPath);

          console.log('[GitHubRunnerWorker] Muxing video and audio streams into source.mp4 with FFmpeg...');
          execFileSync('ffmpeg', ['-y', '-i', videoOnlyPath, '-i', audioOnlyPath, '-c:v', 'copy', '-c:a', 'aac', '-shortest', sourceVideoPath], { stdio: 'inherit' });

          try { fs.unlinkSync(videoOnlyPath); } catch {}
          try { fs.unlinkSync(audioOnlyPath); } catch {}

          const { hasVideo, hasAudio } = verifyMediaHasVideoAndAudio(sourceVideoPath);
          if (hasVideo && hasAudio) {
            acquisitionSuccess = true;
            console.log('[GitHubRunnerWorker] Successfully acquired and verified media with video and audio streams.');
          } else {
            if (fs.existsSync(sourceVideoPath)) fs.unlinkSync(sourceVideoPath);
          }
        } catch (err) {
          console.warn(`[GitHubRunnerWorker] Separate stream download/mux failed (${err.message}).`);
          pipedInstanceManager.recordFailure(streamInfo.instanceUsed, `Separate download failed: ${err.message}`);
        }
      }
    }

    if (!acquisitionSuccess) {
      throw new Error('[MEDIA_ACQUISITION_FAILED] Failed to download usable video and audio streams from Piped.');
    }

    // 3. TRANSCRIBING WITH LOCAL WHISPER
    await updateStatus('transcribing', 45, 'processing');
    console.log('[GitHubRunnerWorker] Extracting audio for Whisper transcription...');
    execSync(`ffmpeg -y -i "${sourceVideoPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 "${audioPath}"`, { stdio: 'inherit' });

    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 5000) {
      throw new Error('[AUDIO_EXTRACTION_FAILED] Extracted audio file is empty or corrupted.');
    }

    console.log('[GitHubRunnerWorker] Running local Whisper transcription (base model)...');
    execSync(`whisper "${audioPath}" --model base --output_dir "${tmpDir}" --output_format json`, { stdio: 'inherit' });

    const jsonResultPath = path.resolve(tmpDir, 'audio.json');
    let transcriptSegments = [];
    if (fs.existsSync(jsonResultPath)) {
      const transcriptData = JSON.parse(fs.readFileSync(jsonResultPath, 'utf8'));
      transcriptSegments = (transcriptData.segments || []).map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
      }));
    }

    if (transcriptSegments.length === 0) {
      throw new Error('[TRANSCRIPTION_FAILED] Whisper produced zero transcript segments.');
    }

    // 4. DETECTING MOMENTS
    await updateStatus('detecting', 65, 'processing');
    console.log('[GitHubRunnerWorker] Analyzing real transcript for candidate moments...');
    const candidates = detectMomentsFromTranscript(transcriptSegments, streamInfo.durationSeconds || 60);

    if (candidates.length === 0) {
      throw new Error('[MOMENT_DETECTION_FAILED] Zero valid candidates detected from transcript.');
    }

    // 5. RENDERING CLIPS & UPLOADING TO FIREBASE
    await updateStatus('rendering', 80, 'processing');
    const clipsColRef = collection(db, 'workspaces', workspaceId, 'clips');
    const generatedClips = [];

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const clipOutputName = `clip_${i + 1}.mp4`;
      const clipOutputPath = path.resolve(tmpDir, clipOutputName);
      const thumbOutputName = `thumb_${i + 1}.jpg`;
      const thumbOutputPath = path.resolve(tmpDir, thumbOutputName);

      console.log(`[GitHubRunnerWorker] Rendering 9:16 vertical clip ${i + 1} (${cand.startTime}s - ${cand.endTime}s)...`);
      const ffmpegCmd = [
        'ffmpeg', '-y',
        '-ss', String(cand.startTime),
        '-to', String(cand.endTime),
        '-i', sourceVideoPath,
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        clipOutputPath,
      ];
      execFileSync(ffmpegCmd[0], ffmpegCmd.slice(1), { stdio: 'inherit' });

      // Verify rendered clip
      if (!fs.existsSync(clipOutputPath) || fs.statSync(clipOutputPath).size < 10000) {
        throw new Error(`[RENDER_FAILED] Rendered clip ${i + 1} file is missing or corrupted.`);
      }

      const clipMediaCheck = verifyMediaHasVideoAndAudio(clipOutputPath);
      if (!clipMediaCheck.hasVideo || !clipMediaCheck.hasAudio) {
        throw new Error(`[RENDER_FAILED] Rendered clip ${i + 1} fails stream check (video: ${clipMediaCheck.hasVideo}, audio: ${clipMediaCheck.hasAudio}).`);
      }

      // Thumbnail generation from actual clip
      const thumbCmd = [
        'ffmpeg', '-y',
        '-ss', '2',
        '-i', clipOutputPath,
        '-vframes', '1',
        thumbOutputPath,
      ];
      try {
        execFileSync(thumbCmd[0], thumbCmd.slice(1), { stdio: 'ignore' });
      } catch (thumbGenErr) {
        console.warn(`[GitHubRunnerWorker] Thumbnail extraction warning for clip ${i + 1}:`, thumbGenErr.message);
      }

      // Upload clip to Firebase Storage
      await updateStatus('uploading', 90, 'processing');
      console.log(`[GitHubRunnerWorker] Uploading clip ${i + 1} to Firebase Storage...`);

      const clipBuffer = fs.readFileSync(clipOutputPath);
      const clipStorageRef = ref(storage, `workspaces/${workspaceId}/clips/${jobId}_${cand.id}.mp4`);
      await uploadBytes(clipStorageRef, clipBuffer, { contentType: 'video/mp4' });
      const videoDownloadUrl = await getDownloadURL(clipStorageRef);

      let thumbDownloadUrl = null;
      if (fs.existsSync(thumbOutputPath)) {
        try {
          const thumbBuffer = fs.readFileSync(thumbOutputPath);
          const thumbStorageRef = ref(storage, `workspaces/${workspaceId}/thumbnails/${jobId}_${cand.id}.jpg`);
          await uploadBytes(thumbStorageRef, thumbBuffer, { contentType: 'image/jpeg' });
          thumbDownloadUrl = await getDownloadURL(thumbStorageRef);
        } catch (thumbUploadErr) {
          console.warn(`[GitHubRunnerWorker] Thumbnail upload warning for clip ${i + 1}:`, thumbUploadErr.message);
        }
      }

      // Save clip metadata to Firestore
      await addDoc(clipsColRef, {
        sourceVideoId: sourceVideoId || 'source',
        jobId,
        title: cand.hook,
        hookText: cand.hook,
        startTime: cand.startTime,
        endTime: cand.endTime,
        duration: cand.duration,
        videoUrl: videoDownloadUrl,
        thumbnailUrl: thumbDownloadUrl,
        viralityScore: cand.score,
        status: 'ready',
        createdAt: new Date().toISOString(),
      });

      generatedClips.push(cand);
    }

    // 6. COMPLETE JOB
    await updateStatus('completed', 100, 'completed');
    console.log(`[GitHubRunnerWorker] Job ${jobId} successfully completed with ${generatedClips.length} verified clips.`);
  } catch (err) {
    console.error('[GitHubRunnerWorker] Job failed:', err);
    try {
      await updateStatus('failed', 100, 'failed', err.message, 'WORKER_EXECUTION_FAILED');
    } catch (statusErr) {
      console.error('[GitHubRunnerWorker] Failed to record final failure status to Firestore:', statusErr.message);
    }
    process.exit(1);
  } finally {
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

run();
