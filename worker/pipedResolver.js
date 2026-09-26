/**
 * Standalone ES Module Piped Resolver for ClipFlow V1 Worker & Server
 * Pure JavaScript compatible with Node.js 18+ (no TypeScript or Vite transform required).
 */
import fetch from 'node-fetch';

const EMERGENCY_FALLBACK_INSTANCES = [
  'https://pipedapi.ducks.party',
  'https://pipedapi.mha.fi',
  'https://pipedapi.palvelu.org',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.colossal.systems',
  'https://pipedapi.us.projectsegfau.lt',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.privacy.com.de',
  'https://api.piped.privacydev.net',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.rht.bz',
  'https://pipedapi.lunar.icu',
  'https://pipedapi.projectsegfau.lt',
  'https://pipedapi.nosearch.org',
  'https://api.piped.yt',
  'https://pipedapi.smnz.de',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.drgns.space',
  'https://pipedapi.freetube.video',
  'https://pipedapi.sync.bz',
  'https://pipedapi.darkness.services',
];

const DYNAMIC_DISCOVERY_SOURCES = [
  'https://piped-instances.kavin.rocks/',
  'https://raw.githubusercontent.com/TeamPiped/Piped-Frontend/main/src/assets/instances.json',
  'https://raw.githubusercontent.com/fediverse/piped-instances/main/instances.json',
];

export class PipedInstanceManager {
  constructor() {
    this.candidatePool = [...EMERGENCY_FALLBACK_INSTANCES];
    this.validatedHealthyInstances = [];
    this.healthMap = new Map();
    this.lastValidationTime = 0;
    this.validationIntervalMs = 900000; // 15 minutes
  }

  normalizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    let trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return null;
    }
    trimmed = trimmed.replace(/\/+$/, '');
    if (
      trimmed.endsWith('/watch') ||
      trimmed.endsWith('/channel') ||
      trimmed.endsWith('/user') ||
      trimmed.endsWith('/c')
    ) {
      return null;
    }
    return trimmed;
  }

  async discoverCandidates() {
    console.log('[PipedManager] Discovering current Piped instances...');
    const discovered = new Set();

    if (process.env.PIPED_INSTANCES) {
      process.env.PIPED_INSTANCES.split(',').forEach((s) => {
        const norm = this.normalizeUrl(s);
        if (norm) discovered.add(norm);
      });
    }

    for (const source of DYNAMIC_DISCOVERY_SOURCES) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(source, {
          headers: { 'User-Agent': 'ClipFlow/1.0', 'Accept': 'application/json' },
          signal: controller.signal,
        });

        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.instances || data.api_servers || [];
            for (const item of list) {
              const url = typeof item === 'string' ? item : item.api_url || item.apiUrl || item.url || item.name;
              const norm = this.normalizeUrl(url);
              if (norm) {
                if (typeof item === 'object' && item !== null && item.up === false) {
                  continue;
                }
                discovered.add(norm);
              }
            }
          }
        }
      } catch {
        // Skip unavailable discovery endpoint
      } finally {
        clearTimeout(timer);
      }
    }

    for (const fallback of EMERGENCY_FALLBACK_INSTANCES) {
      const norm = this.normalizeUrl(fallback);
      if (norm) discovered.add(norm);
    }

    this.candidatePool = Array.from(discovered);
    console.log(`[PipedManager] Discovered ${this.candidatePool.length} candidate Piped instances.`);
    return this.candidatePool;
  }

  async validateInstance(baseUrl) {
    const start = Date.now();

    // 1. Primary lightweight check: /config
    const configUrl = `${baseUrl}/config`;
    const controller1 = new AbortController();
    const timer1 = setTimeout(() => controller1.abort(), 4000);
    try {
      const res = await fetch(configUrl, {
        headers: { 'User-Agent': 'ClipFlow/1.0', 'Accept': 'application/json' },
        signal: controller1.signal,
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          const text = await res.text();
          const data = JSON.parse(text);
          if (data && typeof data === 'object') {
            const latencyMs = Date.now() - start;
            this.recordSuccess(baseUrl, latencyMs);
            return true;
          }
        }
      }
    } catch {
      // Fallback to /trending?region=US if /config fails or times out
    } finally {
      clearTimeout(timer1);
    }

    // 2. Secondary check: /trending?region=US
    const trendingUrl = `${baseUrl}/trending?region=US`;
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), 4000);
    try {
      const res = await fetch(trendingUrl, {
        headers: { 'User-Agent': 'ClipFlow/1.0', 'Accept': 'application/json' },
        signal: controller2.signal,
      });

      if (!res.ok) {
        this.recordFailure(baseUrl, `HTTP ${res.status}`);
        return false;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        this.recordFailure(baseUrl, `Non-JSON response (${contentType})`);
        return false;
      }

      const text = await res.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        const latencyMs = Date.now() - start;
        this.recordSuccess(baseUrl, latencyMs);
        return true;
      }

      this.recordFailure(baseUrl, 'Response is not a JSON array');
      return false;
    } catch (err) {
      this.recordFailure(baseUrl, err.message || 'Network/timeout error');
      return false;
    } finally {
      clearTimeout(timer2);
    }
  }

  async getValidatedHealthyInstances(forceRefresh = false) {
    const now = Date.now();
    if (
      forceRefresh ||
      this.validatedHealthyInstances.length === 0 ||
      now - this.lastValidationTime > this.validationIntervalMs
    ) {
      await this.discoverCandidates();
      console.log(`[PipedManager] Validating ${this.candidatePool.length} candidate instances...`);

      const results = await Promise.all(
        this.candidatePool.map(async (candidate) => {
          const isValid = await this.validateInstance(candidate);
          return { candidate, isValid };
        })
      );

      this.validatedHealthyInstances = results
        .filter((r) => r.isValid)
        .map((r) => r.candidate)
        .sort((a, b) => {
          const ha = this.healthMap.get(a);
          const hb = this.healthMap.get(b);
          const fa = ha?.consecutiveFailures || 0;
          const fb = hb?.consecutiveFailures || 0;
          if (fa !== fb) return fa - fb;
          return (ha?.latencyMs || 9999) - (hb?.latencyMs || 9999);
        });

      this.lastValidationTime = Date.now();
      console.log(
        `[PipedManager] ${this.validatedHealthyInstances.length}/${this.candidatePool.length} instances passed health validation.`
      );
    }

    return [...this.validatedHealthyInstances];
  }

  recordFailure(instanceUrl, reason) {
    const current = this.healthMap.get(instanceUrl) || {
      url: instanceUrl,
      consecutiveFailures: 0,
      lastChecked: Date.now(),
      isHealthy: true,
      latencyMs: 9999,
    };
    current.consecutiveFailures += 1;
    current.lastChecked = Date.now();
    current.isHealthy = false;
    this.healthMap.set(instanceUrl, current);
  }

  recordSuccess(instanceUrl, latencyMs = 0) {
    this.healthMap.set(instanceUrl, {
      url: instanceUrl,
      consecutiveFailures: 0,
      lastChecked: Date.now(),
      isHealthy: true,
      latencyMs,
    });
  }

  getStatus() {
    return {
      discoveredCount: this.candidatePool.length,
      healthyCount: this.validatedHealthyInstances.length,
      lastValidationTime: new Date(this.lastValidationTime).toISOString(),
      validatedInstances: this.validatedHealthyInstances,
    };
  }
}

export const pipedInstanceManager = new PipedInstanceManager();

export function extractYouTubeVideoId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = trimmed.match(regExp);
  return match && match[2].length === 11 ? match[2] : trimmed;
}

export async function resolvePipedStream(youtubeUrlOrId) {
  const videoId = extractYouTubeVideoId(youtubeUrlOrId);
  if (!videoId || videoId.length !== 11) {
    throw new Error(`[PIPED_INVALID_RESPONSE] Invalid YouTube video ID extracted from "${youtubeUrlOrId}"`);
  }

  let healthyInstances = await pipedInstanceManager.getValidatedHealthyInstances();
  let lastError = null;
  let attempts = 0;

  while (attempts < 2) {
    if (healthyInstances.length === 0) {
      console.warn(`[PipedResolver] No validated healthy instances in pool. Force refreshing discovery...`);
      healthyInstances = await pipedInstanceManager.getValidatedHealthyInstances(true);
    }

    for (let i = 0; i < healthyInstances.length; i++) {
      const instance = healthyInstances[i];
      const endpoint = `${instance}/streams/${videoId}`;
      console.log(`[PipedResolver] Trying instance ${i + 1}/${healthyInstances.length}: ${instance} for video ${videoId}...`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(endpoint, {
          headers: {
            'User-Agent': 'ClipFlow/1.0',
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('json')) {
          throw new Error(`Non-JSON content-type (${contentType})`);
        }

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('Invalid JSON response body');
        }

        if (data.error || data.message) {
          throw new Error(data.error || data.message);
        }

        if (!data || (!data.videoStreams && !data.url)) {
          throw new Error('Response JSON missing videoStreams or url');
        }

        pipedInstanceManager.recordSuccess(instance);

        const title = data.title || `YouTube Video ${videoId}`;
        const durationSeconds = Number(data.duration) || 0;
        const thumbnailUrl = data.thumbnailUrl || data.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const videoStreams = Array.isArray(data.videoStreams) ? data.videoStreams : [];
        const audioStreams = Array.isArray(data.audioStreams) ? data.audioStreams : [];

        let videoStreamUrl = null;
        let audioStreamUrl = null;
        let combinedUrl = null;

        const bestVideo = videoStreams.find((s) => s.url && s.mimeType?.includes('video/mp4')) || videoStreams[0];
        if (bestVideo && bestVideo.url) {
          videoStreamUrl = bestVideo.url;
        }

        const bestAudio = audioStreams.find((s) => s.url && s.mimeType?.includes('audio/')) || audioStreams[0];
        if (bestAudio && bestAudio.url) {
          audioStreamUrl = bestAudio.url;
        }

        if (data.url && typeof data.url === 'string') {
          combinedUrl = data.url;
        }

        if (!videoStreamUrl && !combinedUrl) {
          throw new Error('No valid video or combined stream URLs found in response');
        }

        console.log(`[PipedResolver] Stream resolution succeeded from instance ${instance}`);
        return {
          sourceVideoId: videoId,
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          videoStreamUrl,
          audioStreamUrl,
          combinedUrl,
          durationSeconds,
          title,
          thumbnailUrl,
          instanceUsed: instance,
        };
      } catch (err) {
        console.warn(`[PipedResolver] Instance ${instance} failed: ${err.message}`);
        pipedInstanceManager.recordFailure(instance, err.message);
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }

    if (attempts === 0) {
      console.log(`[PipedResolver] All validated instances failed on first pass. Refreshing discovery & re-validating...`);
      healthyInstances = await pipedInstanceManager.getValidatedHealthyInstances(true);
    }
    attempts++;
  }

  throw new Error(
    `[PIPED_INSTANCE_UNAVAILABLE] No healthy Piped API instance could resolve this video after discovery and retry. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

export async function checkPipedHealth() {
  try {
    const status = pipedInstanceManager.getStatus();
    const healthy = status.healthyCount > 0;
    return {
      configured: true,
      reachable: healthy,
      details: `${status.healthyCount}/${status.discoveredCount} Piped instances validated healthy`,
      status,
    };
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      details: `Piped manager error: ${err.message}`,
      status: null,
    };
  }
}
