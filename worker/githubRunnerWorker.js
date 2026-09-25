/**
 * GitHub Actions Runner Worker for ClipFlow V1 (Plain JavaScript)
 * Runs inside GitHub Actions runner: Resolves stream via automatic Piped discovery & failover,
 * downloads media, transcribes with local CPU Whisper, detects candidate moments from real transcript timestamps,
 * renders 9:16 vertical shorts with FFmpeg, and uploads to Firebase Storage & Firestore.
 */
import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import fetch from 'node-fetch';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const jobId = process.env.JOB_ID;
const sourceVideoId = process.env.VIDEO_ID || process.env.SOURCE_VIDEO_ID;
const youtubeUrl = process.env.VIDEO_URL || process.env.YOUTUBE_URL;
const workspaceId = process.env.WORKSPACE_ID || 'default-workspace';

const DEFAULT_PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.privacy.com.de',
  'https://api.piped.privacydev.net',
  'https://pipedapi.ducks.party',
];

const INSTANCE_SOURCES = [
  'https://piped-instances.kavin.rocks/',
  'https://raw.githubusercontent.com/TeamPiped/Piped-Frontend/main/src/assets/instances.json',
];

/**
 * Shared Worker-Compatible Piped Instance Manager with Automatic Discovery & Failover
 */
class WorkerPipedInstanceManager {
  constructor() {
    this.instances = [];
    this.healthMap = new Map();
    this.lastRefreshTime = 0;
  }

  async getHealthyInstances(forceRefresh = false) {
    if (forceRefresh || this.instances.length === 0) {
      await this.discoverInstances();
    }
    return [...this.instances].sort((a, b) => {
      const fa = this.healthMap.get(a)?.consecutiveFailures || 0;
      const fb = this.healthMap.get(b)?.consecutiveFailures || 0;
      return fa - fb;
    });
  }

  async discoverInstances() {
    const discovered = new Set();
    if (process.env.PIPED_INSTANCES) {
      process.env.PIPED_INSTANCES.split(',').forEach((s) => {
        const trimmed = s.trim().replace(/\/$/, '');
        if (trimmed) discovered.add(trimmed);
      });
    }

    for (const source of INSTANCE_SOURCES) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(source, { headers: { 'User-Agent': 'ClipFlow-Worker/1.0' }, signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.instances || data.api_servers || [];
          for (const item of list) {
            const url = typeof item === 'string' ? item : item.api_url || item.url || item.name;
            if (url && typeof url === 'string') {
              const normalized = url.trim().replace(/\/$/, '');
              if (normalized.startsWith('http')) discovered.add(normalized);
            }
          }
        }
      } catch {}
    }

    for (const def of DEFAULT_PIPED_INSTANCES) discovered.add(def);

    this.instances = Array.from(discovered);
    this.lastRefreshTime = Date.now();
    console.log(`[WorkerPipedManager] Discovered ${this.instances.length} Piped API instances.`);
  }

  recordFailure(url) {
    const cur = this.healthMap.get(url) || { consecutiveFailures: 0, isHealthy: true };
    cur.consecutiveFailures += 1;
    cur.isHealthy = cur.consecutiveFailures < 3;
    this.healthMap.set(url, cur);
  }

  recordSuccess(url) {
    this.healthMap.set(url, { consecutiveFailures: 0, isHealthy: true });
  }
}

const pipedManager = new WorkerPipedInstanceManager();

function extractYouTubeVideoId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  return match && match[2].length === 11 ? match[2] : trimmed;
}

async function resolveStream(urlOrId) {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId || videoId.length !== 11) {
    throw new Error(`[PIPED_INVALID_RESPONSE] Invalid YouTube video ID extracted from "${urlOrId}"`);
  }

  let instances = await pipedManager.getHealthyInstances();
  let attempts = 0;
  let lastError = null;

  while (attempts < 2) {
    for (const instance of instances) {
      try {
        console.log(`[GitHubRunnerWorker] Trying Piped instance "${instance}" for video ${videoId}...`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`${instance}/streams/${videoId}`, {
          headers: { 'User-Agent': 'ClipFlow-Worker/1.0', 'Accept': 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        const data = await res.json();
        if (!data || (!data.videoStreams && !data.url)) throw new Error('Invalid response JSON');

        pipedManager.recordSuccess(instance);

        const videoStreams = data.videoStreams || [];
        const bestVideo = videoStreams.find((s) => s.url && s.mimeType?.includes('video/mp4')) || videoStreams[0];
        const combined = data.url;

        if (bestVideo?.url || combined) {
          console.log(`[GitHubRunnerWorker] Successfully resolved stream from ${instance}`);
          return {
            videoStreamUrl: bestVideo?.url || combined,
            audioStreamUrl: data.audioStreams?.[0]?.url || null,
            durationSeconds: Number(data.duration) || 0,
            title: data.title || 'YouTube Source Video',
          };
        }
      } catch (e) {
        console.warn(`[GitHubRunnerWorker] Instance "${instance}" failed:`, e.message);
        pipedManager.recordFailure(instance);
        lastError = e;
      }
    }

    if (attempts === 0) {
      console.log(`[GitHubRunnerWorker] Refreshing Piped instance pool and retrying...`);
      instances = await pipedManager.getHealthyInstances(true);
    }
    attempts++;
  }

  throw new Error(`[PIPED_INSTANCE_UNAVAILABLE] All Piped instances failed for video ${videoId}. Last error: ${lastError?.message || 'Unknown'}`);
}

async function updateStatus(stage, progress, status = 'processing', error = null, errorCode = null) {
  if (!jobId) return;
  try {
    const jobRef = doc(db, 'workspaces', workspaceId, 'jobs', jobId);
    await updateDoc(jobRef, {
      stage,
      progress,
      status,
      error,
      errorCode,
      updatedAt: new Date().toISOString(),
      ...(status === 'completed' || status === 'failed' ? { completedAt: new Date().toISOString() } : {}),
    });
    console.log(`[GitHubRunnerWorker] Job status updated -> Stage: ${stage}, Progress: ${progress}%, Status: ${status}`);
  } catch (err) {
    console.error('[GitHubRunnerWorker] Failed to update Firestore job status:', err);
  }
}

/**
 * Transcript-Based Moment Detector (Plain JS)
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
    await updateStatus('resolving', 10, 'processing');
    const streamInfo = await resolveStream(youtubeUrl);

    await updateStatus('downloading', 25, 'processing');
    const videoPath = path.resolve(tmpDir, 'source.mp4');
    const audioPath = path.resolve(tmpDir, 'audio.mp3');

    console.log(`[GitHubRunnerWorker] Downloading video to ${videoPath}...`);
    const resp = await fetch(streamInfo.videoStreamUrl);
    const buffer = await resp.arrayBuffer();
    fs.writeFileSync(videoPath, Buffer.from(buffer));

    if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size < 1000) {
      throw new Error('Downloaded source video file is empty or corrupted.');
    }

    await updateStatus('transcribing', 45, 'processing');
    console.log('[GitHubRunnerWorker] Extracting audio for Whisper transcription...');
    execSync(`ffmpeg -y -i "${videoPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 "${audioPath}"`, { stdio: 'inherit' });

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

    await updateStatus('detecting', 65, 'processing');
    console.log('[GitHubRunnerWorker] Analyzing real transcript for candidate moments...');
    const candidates = detectMomentsFromTranscript(transcriptSegments, streamInfo.durationSeconds || 60);

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
        '-i', videoPath,
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        clipOutputPath,
      ];
      execFileSync(ffmpegCmd[0], ffmpegCmd.slice(1), { stdio: 'inherit' });

      const thumbCmd = [
        'ffmpeg', '-y',
        '-ss', '2',
        '-i', clipOutputPath,
        '-vframes', '1',
        thumbOutputPath,
      ];
      try {
        execFileSync(thumbCmd[0], thumbCmd.slice(1), { stdio: 'ignore' });
      } catch {}

      await updateStatus('uploading', 90, 'processing');
      console.log(`[GitHubRunnerWorker] Uploading clip ${i + 1} to Firebase Storage...`);

      const clipBuffer = fs.readFileSync(clipOutputPath);
      const clipStorageRef = ref(storage, `workspaces/${workspaceId}/clips/${jobId}_${cand.id}.mp4`);
      await uploadBytes(clipStorageRef, clipBuffer, { contentType: 'video/mp4' });
      const videoDownloadUrl = await getDownloadURL(clipStorageRef);

      let thumbDownloadUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=60';
      if (fs.existsSync(thumbOutputPath)) {
        try {
          const thumbBuffer = fs.readFileSync(thumbOutputPath);
          const thumbStorageRef = ref(storage, `workspaces/${workspaceId}/thumbnails/${jobId}_${cand.id}.jpg`);
          await uploadBytes(thumbStorageRef, thumbBuffer, { contentType: 'image/jpeg' });
          thumbDownloadUrl = await getDownloadURL(thumbStorageRef);
        } catch {}
      }

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

    await updateStatus('completed', 100, 'completed');
    console.log(`[GitHubRunnerWorker] Job ${jobId} successfully completed with ${generatedClips.length} clips.`);
  } catch (err) {
    console.error('[GitHubRunnerWorker] Job failed:', err);
    await updateStatus('failed', 100, 'failed', err.message, 'WORKER_EXECUTION_FAILED');
    process.exit(1);
  } finally {
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

run();
