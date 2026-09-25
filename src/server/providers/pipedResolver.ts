import fetch from 'node-fetch';

export interface PipedStreamResult {
  sourceVideoId: string;
  sourceUrl: string;
  videoStreamUrl: string | null;
  audioStreamUrl: string | null;
  combinedStreamUrl: string | null;
  durationSeconds: number;
  title: string;
  thumbnailUrl: string;
  instanceUsed: string;
}

const DEFAULT_PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.privacy.com.de',
  'https://api.piped.privacydev.net',
];

export function extractYouTubeVideoId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  // If already 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = trimmed.match(regExp);
  return match && match[2].length === 11 ? match[2] : trimmed;
}

export async function resolvePipedStream(youtubeUrlOrId: string): Promise<PipedStreamResult> {
  const videoId = extractYouTubeVideoId(youtubeUrlOrId);
  if (!videoId || videoId.length !== 11) {
    throw new Error(`[PIPED_INVALID_RESPONSE] Invalid YouTube video ID extracted from "${youtubeUrlOrId}"`);
  }

  const envInstances = process.env.PIPED_INSTANCES
    ? process.env.PIPED_INSTANCES.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const instances = [...envInstances, ...DEFAULT_PIPED_INSTANCES];
  // Deduplicate
  const uniqueInstances = Array.from(new Set(instances));

  let lastError: any = null;

  for (const instance of uniqueInstances) {
    const endpoint = `${instance.replace(/\/$/, '')}/streams/${videoId}`;
    try {
      console.log(`[PipedResolver] Trying Piped instance "${instance}" for video ${videoId}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(endpoint, {
        headers: {
          'User-Agent': 'ClipFlow/1.0 (Autonomous Short-Form Generator)',
          'Accept': 'application/json',
        },
        signal: controller.signal as any,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP status ${res.status} from ${instance}`);
      }

      const data: any = await res.json();
      if (!data) {
        throw new Error(`Empty response JSON from ${instance}`);
      }

      const title = data.title || `YouTube Video ${videoId}`;
      const durationSeconds = Number(data.duration) || 0;
      const thumbnailUrl = data.thumbnailUrl || data.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      // Find video and audio streams
      const videoStreams = Array.isArray(data.videoStreams) ? data.videoStreams : [];
      const audioStreams = Array.isArray(data.audioStreams) ? data.audioStreams : [];

      // Select best mp4/webm stream or combined stream
      let videoStreamUrl: string | null = null;
      let audioStreamUrl: string | null = null;
      let combinedStreamUrl: string | null = null;

      // Check for combined audio/video or separate streams
      const bestVideo = videoStreams.find((s: any) => s.url && s.mimeType?.includes('video/mp4')) || videoStreams[0];
      if (bestVideo && bestVideo.url) {
        videoStreamUrl = bestVideo.url;
      }

      const bestAudio = audioStreams.find((s: any) => s.url && s.mimeType?.includes('audio/')) || audioStreams[0];
      if (bestAudio && bestAudio.url) {
        audioStreamUrl = bestAudio.url;
      }

      if (data.url && typeof data.url === 'string') {
        combinedStreamUrl = data.url;
      }

      if (!videoStreamUrl && !combinedStreamUrl) {
        throw new Error(`No valid video streams found in Piped response for ${videoId}`);
      }

      console.log(`[PipedResolver] Successfully resolved stream from instance "${instance}"`);
      return {
        sourceVideoId: videoId,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        videoStreamUrl,
        audioStreamUrl,
        combinedStreamUrl,
        durationSeconds,
        title,
        thumbnailUrl,
        instanceUsed: instance,
      };
    } catch (err: any) {
      console.warn(`[PipedResolver] Instance "${instance}" failed: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(
    `[PIPED_INSTANCE_UNAVAILABLE] All Piped instances failed for video ${videoId}. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

export async function checkPipedHealth(): Promise<{ configured: boolean; reachable: boolean; details: string }> {
  const envInstances = process.env.PIPED_INSTANCES
    ? process.env.PIPED_INSTANCES.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const instances = [...envInstances, ...DEFAULT_PIPED_INSTANCES];
  const testId = 'jNQXAC9IVRw'; // Me at the zoo

  for (const instance of instances.slice(0, 2)) {
    try {
      const res = await fetch(`${instance.replace(/\/$/, '')}/streams/${testId}`, {
        headers: { 'User-Agent': 'ClipFlow/1.0' },
        timeout: 5000,
      } as any);
      if (res.ok) {
        return { configured: true, reachable: true, details: `Healthy via ${instance}` };
      }
    } catch {}
  }

  return { configured: true, reachable: false, details: 'Piped instances currently unreachable' };
}
