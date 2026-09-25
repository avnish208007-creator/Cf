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

export interface PipedInstanceHealth {
  url: string;
  consecutiveFailures: number;
  lastChecked: number;
  isHealthy: boolean;
}

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

class PipedInstanceManager {
  private instances: string[] = [];
  private healthMap: Map<string, PipedInstanceHealth> = new Map();
  private lastRefreshTime: number = 0;
  private refreshIntervalMs: number = 3600000; // 1 hour
  private discoveryPromise: Promise<string[]> | null = null;

  constructor() {
    this.instances = [...DEFAULT_PIPED_INSTANCES];
  }

  public async getHealthyInstances(forceRefresh = false): Promise<string[]> {
    const now = Date.now();
    if (forceRefresh || this.instances.length === 0 || now - this.lastRefreshTime > this.refreshIntervalMs) {
      await this.discoverInstances();
    }

    // Sort instances: healthy first, fewest consecutive failures first
    const sorted = [...this.instances].sort((a, b) => {
      const ha = this.healthMap.get(a);
      const hb = this.healthMap.get(b);
      const fa = ha?.consecutiveFailures || 0;
      const fb = hb?.consecutiveFailures || 0;
      return fa - fb;
    });

    return sorted;
  }

  private async discoverInstances(): Promise<string[]> {
    if (this.discoveryPromise) {
      return this.discoveryPromise;
    }

    this.discoveryPromise = (async () => {
      const discovered = new Set<string>();

      // Add environment instances first if configured
      if (process.env.PIPED_INSTANCES) {
        process.env.PIPED_INSTANCES.split(',').forEach((s) => {
          const trimmed = s.trim().replace(/\/$/, '');
          if (trimmed) discovered.add(trimmed);
        });
      }

      // Try fetching from public instance sources
      for (const source of INSTANCE_SOURCES) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(source, {
            headers: { 'User-Agent': 'ClipFlow/1.0' },
            signal: controller.signal as any,
          });
          clearTimeout(timeout);

          if (res.ok) {
            const data: any = await res.json();
            // Handle different json schemas (array of objects or array of strings)
            const list = Array.isArray(data) ? data : data.instances || data.api_servers || [];
            for (const item of list) {
              const url = typeof item === 'string' ? item : item.api_url || item.url || item.name;
              if (url && typeof url === 'string') {
                const normalized = url.trim().replace(/\/$/, '');
                if (normalized.startsWith('http')) {
                  discovered.add(normalized);
                }
              }
            }
          }
        } catch (err) {
          console.warn(`[PipedManager] Failed to fetch instances from source ${source}:`, err);
        }
      }

      // Fall back to defaults if nothing discovered
      for (const def of DEFAULT_PIPED_INSTANCES) {
        discovered.add(def);
      }

      const list = Array.from(discovered);
      if (list.length > 0) {
        this.instances = list;
        this.lastRefreshTime = Date.now();
        console.log(`[PipedManager] Successfully refreshed Piped instances pool. Total: ${list.length}`);
      }

      this.discoveryPromise = null;
      return this.instances;
    })();

    return this.discoveryPromise;
  }

  public recordFailure(instanceUrl: string) {
    const current = this.healthMap.get(instanceUrl) || {
      url: instanceUrl,
      consecutiveFailures: 0,
      lastChecked: Date.now(),
      isHealthy: true,
    };
    current.consecutiveFailures += 1;
    current.lastChecked = Date.now();
    current.isHealthy = current.consecutiveFailures < 3;
    this.healthMap.set(instanceUrl, current);
  }

  public recordSuccess(instanceUrl: string) {
    const current = this.healthMap.get(instanceUrl) || {
      url: instanceUrl,
      consecutiveFailures: 0,
      lastChecked: Date.now(),
      isHealthy: true,
    };
    current.consecutiveFailures = 0;
    current.lastChecked = Date.now();
    current.isHealthy = true;
    this.healthMap.set(instanceUrl, current);
  }

  public getStatus() {
    return {
      discoveredCount: this.instances.length,
      healthyCount: this.instances.filter((url) => this.healthMap.get(url)?.isHealthy ?? true).length,
      lastRefreshTime: new Date(this.lastRefreshTime).toISOString(),
      instances: this.instances,
    };
  }
}

export const pipedInstanceManager = new PipedInstanceManager();

export function extractYouTubeVideoId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
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

  let instances = await pipedInstanceManager.getHealthyInstances();
  let lastError: any = null;
  let attempts = 0;

  while (attempts < 2) {
    for (const instance of instances) {
      const endpoint = `${instance}/streams/${videoId}`;
      try {
        console.log(`[PipedResolver] Trying Piped instance "${instance}" for video ${videoId}...`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000); // 6s short timeout

        const res = await fetch(endpoint, {
          headers: {
            'User-Agent': 'ClipFlow/1.0',
            'Accept': 'application/json',
          },
          signal: controller.signal as any,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`HTTP status ${res.status}`);
        }

        const data: any = await res.json();
        if (!data || (!data.videoStreams && !data.url)) {
          throw new Error(`Invalid or empty response JSON`);
        }

        pipedInstanceManager.recordSuccess(instance);

        const title = data.title || `YouTube Video ${videoId}`;
        const durationSeconds = Number(data.duration) || 0;
        const thumbnailUrl = data.thumbnailUrl || data.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const videoStreams = Array.isArray(data.videoStreams) ? data.videoStreams : [];
        const audioStreams = Array.isArray(data.audioStreams) ? data.audioStreams : [];

        let videoStreamUrl: string | null = null;
        let audioStreamUrl: string | null = null;
        let combinedStreamUrl: string | null = null;

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
          throw new Error(`No valid video streams found in Piped response`);
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
        pipedInstanceManager.recordFailure(instance);
        lastError = err;
      }
    }

    // If first attempt across all instances failed, force refresh instance list once and retry
    if (attempts === 0) {
      console.log(`[PipedResolver] All instances failed on first pass. Forcing instance list refresh...`);
      instances = await pipedInstanceManager.getHealthyInstances(true);
    }
    attempts++;
  }

  throw new Error(
    `[PIPED_INSTANCE_UNAVAILABLE] All Piped instances failed for video ${videoId}. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

export async function checkPipedHealth(): Promise<{ configured: boolean; reachable: boolean; details: string; status: any }> {
  try {
    const status = pipedInstanceManager.getStatus();
    const healthy = status.healthyCount > 0;
    return {
      configured: true,
      reachable: healthy,
      details: `${status.healthyCount}/${status.discoveredCount} Piped instances healthy`,
      status,
    };
  } catch (err: any) {
    return {
      configured: true,
      reachable: false,
      details: `Piped manager error: ${err.message}`,
      status: null,
    };
  }
}
