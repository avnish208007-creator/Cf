/**
 * Standalone ES Module Piped Resolver for ClipFlow V1 Worker & Server
 * Pure JavaScript compatible with Node.js 18+ (no TypeScript or Vite transform required).
 * Direct video stream resolution (/streams/{videoId}) across candidate instances.
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
    this.healthMap = new Map();
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
      const timer = setTimeout(() => controller.abort(), 5000);
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
        // Skip unavailable discovery endpoint gracefully
      } finally {
        clearTimeout(timer);
      }
    }

    for (const fallback of EMERGENCY_FALLBACK_INSTANCES) {
      const norm = this.normalizeUrl(fallback);
      if (norm) discovered.add(norm);
    }

    this.candidatePool = Array.from(discovered).sort((a, b) => {
      const ha = this.healthMap.get(a);
      const hb = this.healthMap.get(b);
      const fa = ha?.consecutiveFailures || 0;
      const fb = hb?.consecutiveFailures || 0;
      if (fa !== fb) return fa - fb;
      return (ha?.latencyMs || 9999) - (hb?.latencyMs || 9999);
    });

    console.log(`[PipedManager] Discovered ${this.candidatePool.length} candidate Piped instance(s).`);
    return this.candidatePool;
  }

  recordFailure(instanceUrl, reason) {
    const current = this.healthMap.get(instanceUrl) || {
      url: instanceUrl,
      consecutiveFailures: 0,
      lastChecked: Date.now(),
      isHealthy: true,
      latencyMs: 9999,
      lastFailureReason: null,
    };
    current.consecutiveFailures += 1;
    current.lastChecked = Date.now();
    current.isHealthy = false;
    current.lastFailureReason = reason;
    this.healthMap.set(instanceUrl, current);
  }

  recordSuccess(instanceUrl, latencyMs = 0) {
    this.healthMap.set(instanceUrl, {
      url: instanceUrl,
      consecutiveFailures: 0,
      lastChecked: Date.now(),
      isHealthy: true,
      latencyMs,
      lastFailureReason: null,
    });
  }

  getStatus() {
    return {
      discoveredCount: this.candidatePool.length,
      healthMap: Array.from(this.healthMap.entries()),
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

  console.log(`[PipedResolver] Beginning video stream resolution for video ID: ${videoId}...`);

  const stats = {
    discovered: 0,
    streamAttempts: 0,
    http500: 0,
    http403: 0,
    http404: 0,
    http429: 0,
    http502_503_504: 0,
    timeouts: 0,
    dnsFailures: 0,
    invalidResponses: 0,
    noUsableStreams: 0,
  };

  const triedInstances = new Set();

  for (let pass = 1; pass <= 2; pass++) {
    const candidates = await pipedInstanceManager.discoverCandidates();
    stats.discovered = candidates.length;

    const remainingCandidates = candidates.filter((c) => !triedInstances.has(c));
    if (remainingCandidates.length === 0 && pass > 1) {
      break;
    }

    console.log(`[PipedResolver] Pass ${pass}: Testing ${remainingCandidates.length} candidate instance(s) for video ${videoId}...`);

    for (let i = 0; i < remainingCandidates.length; i++) {
      const instance = remainingCandidates[i];
      triedInstances.add(instance);
      stats.streamAttempts++;

      const endpoint = `${instance}/streams/${videoId}`;
      console.log(`[PipedResolver] Trying candidate ${stats.streamAttempts}/${stats.discovered}: ${instance}`);

      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000); // 12-second per-instance timeout

      try {
        const res = await fetch(endpoint, {
          headers: {
            'User-Agent': 'ClipFlow/1.0',
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
          if (res.status === 500) stats.http500++;
          else if (res.status === 403) stats.http403++;
          else if (res.status === 404) stats.http404++;
          else if (res.status === 429) stats.http429++;
          else if ([502, 503, 504].includes(res.status)) stats.http502_503_504++;

          console.warn(`[PipedResolver] FAILED -> Instance: ${instance} | Endpoint: /streams/${videoId} | Status: HTTP ${res.status} (${latencyMs}ms)`);
          pipedInstanceManager.recordFailure(instance, `HTTP ${res.status}`);
          continue;
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('json')) {
          stats.invalidResponses++;
          console.warn(`[PipedResolver] FAILED -> Instance: ${instance} | Reason: Non-JSON content-type (${contentType})`);
          pipedInstanceManager.recordFailure(instance, `Non-JSON content-type (${contentType})`);
          continue;
        }

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          stats.invalidResponses++;
          console.warn(`[PipedResolver] FAILED -> Instance: ${instance} | Reason: Invalid JSON syntax`);
          pipedInstanceManager.recordFailure(instance, 'Invalid JSON body');
          continue;
        }

        // Handle error payloads from Piped
        if ((data.error || data.message) && !data.videoStreams && !data.url) {
          stats.invalidResponses++;
          const msg = data.error || data.message;
          console.warn(`[PipedResolver] FAILED -> Instance: ${instance} | Reason: Piped error response (${msg})`);
          pipedInstanceManager.recordFailure(instance, `Piped API error: ${msg}`);
          continue;
        }

        if (!data) {
          stats.invalidResponses++;
          console.warn(`[PipedResolver] FAILED -> Instance: ${instance} | Reason: Empty JSON body`);
          pipedInstanceManager.recordFailure(instance, 'Empty JSON body');
          continue;
        }

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
          stats.noUsableStreams++;
          console.warn(`[PipedResolver] FAILED -> Instance: ${instance} | Reason: No usable video or combined stream URLs in JSON`);
          pipedInstanceManager.recordFailure(instance, 'No usable video or combined stream URLs');
          continue;
        }

        // SUCCESS!
        console.log(`[PipedResolver] SUCCESS -> Video ID: ${videoId}`);
        console.log(`  Instance: ${instance}`);
        console.log(`  Title: "${title}"`);
        console.log(`  Combined Stream: ${combinedUrl ? 'AVAILABLE' : 'UNAVAILABLE'}`);
        console.log(`  Video Stream: ${videoStreamUrl ? 'AVAILABLE' : 'UNAVAILABLE'}`);
        console.log(`  Audio Stream: ${audioStreamUrl ? 'AVAILABLE' : 'UNAVAILABLE'}`);
        console.log(`  Latency: ${latencyMs}ms`);

        pipedInstanceManager.recordSuccess(instance, latencyMs);

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
        const latencyMs = Date.now() - start;
        if (err.name === 'AbortError') {
          stats.timeouts++;
          console.warn(`[PipedResolver] FAILED -> Instance: ${instance} | Reason: Timeout (>12s) (${latencyMs}ms)`);
          pipedInstanceManager.recordFailure(instance, 'Timeout (>12s)');
        } else if (err.message.includes('ENOTFOUND') || err.message.includes('EAI_AGAIN')) {
          stats.dnsFailures++;
          console.warn(`[PipedResolver] FAILED -> Instance: ${instance} | Reason: DNS failure (${err.message})`);
          pipedInstanceManager.recordFailure(instance, `DNS failure: ${err.message}`);
        } else {
          stats.invalidResponses++;
          console.warn(`[PipedResolver] FAILED -> Instance: ${instance} | Reason: ${err.message}`);
          pipedInstanceManager.recordFailure(instance, err.message);
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const diagnosticMsg =
    `[PIPED_STREAM_RESOLUTION_FAILED] No discovered Piped API instance could resolve YouTube video ${videoId}. ` +
    `Diagnostics: discovered=${stats.discovered}, streamAttempts=${stats.streamAttempts}, http500=${stats.http500}, ` +
    `http403=${stats.http403}, http404=${stats.http404}, http429=${stats.http429}, http5xx=${stats.http502_503_504}, ` +
    `timeouts=${stats.timeouts}, dnsFailures=${stats.dnsFailures}, invalidResponses=${stats.invalidResponses}, noUsableStreams=${stats.noUsableStreams}.`;

  console.error(diagnosticMsg);
  throw new Error(diagnosticMsg);
}

export async function checkPipedHealth() {
  try {
    const status = pipedInstanceManager.getStatus();
    return {
      configured: true,
      reachable: status.discoveredCount > 0,
      details: `${status.discoveredCount} Piped instances available for stream resolution`,
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
