/**
 * Robust Multi-Provider YouTube Stream Resolver for ClipFlow V1 Worker
 * Pure Node.js 20+ ES module. Zero external package dependencies.
 * Fast Batched Resolution across Providers: 1. Piped (/streams/{videoId}) -> 2. Invidious (/api/v1/videos/{videoId})
 */

const PIPED_FALLBACK_INSTANCES = [
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

const PIPED_DISCOVERY_SOURCES = [
  'https://piped-instances.kavin.rocks/',
  'https://raw.githubusercontent.com/TeamPiped/Piped-Frontend/main/src/assets/instances.json',
  'https://raw.githubusercontent.com/fediverse/piped-instances/main/instances.json',
];

const INVIDIOUS_FALLBACK_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://inv.us.projectsegfau.lt',
  'https://invidious.drgns.space',
  'https://invidious.lunar.icu',
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://invidious.fdn.fr',
  'https://invidious.flokinet.to',
  'https://invidious.io.lol',
  'https://inv.tux.pizza',
  'https://invidious.snopyta.org',
  'https://invidious.kavin.rocks',
  'https://yt.artemislena.eu',
  'https://invidious.esmailelbob.xyz',
  'https://invidious.projectsegfau.lt',
  'https://yewtu.be',
  'https://inv.riverside.rocks',
];

const INVIDIOUS_DISCOVERY_SOURCES = [
  'https://api.invidious.io/instances.json?sort_by=health,type',
];

export function normalizeUrl(rawUrl) {
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

function isAbsoluteHttpUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export class PipedInstanceManager {
  constructor() {
    this.healthMap = new Map();
  }

  async discoverCandidates() {
    const discovered = new Set();

    if (process.env.PIPED_INSTANCES) {
      process.env.PIPED_INSTANCES.split(',').forEach((s) => {
        const norm = normalizeUrl(s);
        if (norm) discovered.add(norm);
      });
    }

    for (const source of PIPED_DISCOVERY_SOURCES) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
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
              const norm = normalizeUrl(url);
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

    for (const fallback of PIPED_FALLBACK_INSTANCES) {
      const norm = normalizeUrl(fallback);
      if (norm) discovered.add(norm);
    }

    return Array.from(discovered).sort((a, b) => {
      const ha = this.healthMap.get(a);
      const hb = this.healthMap.get(b);
      const fa = ha?.consecutiveFailures || 0;
      const fb = hb?.consecutiveFailures || 0;
      if (fa !== fb) return fa - fb;
      return (ha?.latencyMs || 9999) - (hb?.latencyMs || 9999);
    });
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
      healthMap: Array.from(this.healthMap.entries()),
    };
  }
}

export const pipedInstanceManager = new PipedInstanceManager();

async function discoverInvidiousCandidates() {
  const discovered = new Set();

  if (process.env.INVIDIOUS_INSTANCES) {
    process.env.INVIDIOUS_INSTANCES.split(',').forEach((s) => {
      const norm = normalizeUrl(s);
      if (norm) discovered.add(norm);
    });
  }

  for (const source of INVIDIOUS_DISCOVERY_SOURCES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(source, {
        headers: { 'User-Agent': 'ClipFlow/1.0', 'Accept': 'application/json' },
        signal: controller.signal,
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          const data = await res.json();
          if (Array.isArray(data)) {
            for (const tuple of data) {
              const domain = Array.isArray(tuple) ? tuple[0] : null;
              const meta = Array.isArray(tuple) ? tuple[1] : null;
              if (domain && meta && meta.api !== false) {
                const norm = normalizeUrl(`https://${domain}`);
                if (norm) discovered.add(norm);
              }
            }
          }
        }
      }
    } catch {
      // Skip unavailable Invidious discovery endpoint
    } finally {
      clearTimeout(timer);
    }
  }

  for (const fallback of INVIDIOUS_FALLBACK_INSTANCES) {
    const norm = normalizeUrl(fallback);
    if (norm) discovered.add(norm);
  }

  return Array.from(discovered);
}

function updateGlobalStats(err, res, stats) {
  if (res) {
    if (res.status === 403) stats.http403++;
    else if (res.status === 404) stats.http404++;
    else if (res.status === 429) stats.http429++;
    else if (res.status >= 500) stats.http5xx++;
  } else if (err) {
    if (err.name === 'AbortError') stats.timeouts++;
    else if (err.message?.includes('CERT_') || err.message?.includes('SSL') || err.message?.includes('tls') || err.message?.includes('certificate')) stats.tlsFailures++;
    else if (err.message?.includes('ENOTFOUND') || err.message?.includes('EAI_AGAIN')) stats.dnsFailures++;
    else stats.invalidResponses++;
  }
}

/**
 * Single candidate attempt for Piped
 */
async function fetchPipedCandidate(instance, videoId, globalStats) {
  globalStats.pipedAttempted++;
  const endpoint = `${instance}/streams/${videoId}`;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'ClipFlow/1.0', 'Accept': 'application/json' },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      updateGlobalStats(null, res, globalStats);
      pipedInstanceManager.recordFailure(instance, `HTTP ${res.status}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      globalStats.invalidResponses++;
      pipedInstanceManager.recordFailure(instance, `Non-JSON (${contentType})`);
      return null;
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      globalStats.invalidResponses++;
      pipedInstanceManager.recordFailure(instance, 'Invalid JSON body');
      return null;
    }

    if ((data.error || data.message) && !data.videoStreams && !data.url) {
      globalStats.invalidResponses++;
      pipedInstanceManager.recordFailure(instance, `Piped error: ${data.error || data.message}`);
      return null;
    }

    if (!data) {
      globalStats.invalidResponses++;
      pipedInstanceManager.recordFailure(instance, 'Empty JSON');
      return null;
    }

    const title = data.title || `YouTube Video ${videoId}`;
    const durationSeconds = Number(data.duration) || 0;
    const thumbnailUrl = isAbsoluteHttpUrl(data.thumbnailUrl)
      ? data.thumbnailUrl
      : isAbsoluteHttpUrl(data.thumbnail)
      ? data.thumbnail
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    const videoStreams = Array.isArray(data.videoStreams) ? data.videoStreams : [];
    const audioStreams = Array.isArray(data.audioStreams) ? data.audioStreams : [];

    let videoStreamUrl = null;
    let audioStreamUrl = null;
    let combinedUrl = null;

    const bestVideo = videoStreams.find((s) => s.url && isAbsoluteHttpUrl(s.url) && s.mimeType?.includes('video/mp4')) ||
      videoStreams.find((s) => s.url && isAbsoluteHttpUrl(s.url));
    if (bestVideo?.url) videoStreamUrl = bestVideo.url;

    const bestAudio = audioStreams.find((s) => s.url && isAbsoluteHttpUrl(s.url) && s.mimeType?.includes('audio/')) ||
      audioStreams.find((s) => s.url && isAbsoluteHttpUrl(s.url));
    if (bestAudio?.url) audioStreamUrl = bestAudio.url;

    if (data.url && typeof data.url === 'string' && isAbsoluteHttpUrl(data.url)) {
      combinedUrl = data.url;
    }

    if (!videoStreamUrl && !combinedUrl) {
      globalStats.noUsableStreams++;
      pipedInstanceManager.recordFailure(instance, 'No usable stream URLs');
      return null;
    }

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
      provider: 'piped',
      instanceUsed: instance,
      latencyMs,
    };
  } catch (err) {
    updateGlobalStats(err, null, globalStats);
    pipedInstanceManager.recordFailure(instance, err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PIPED PROVIDER RESOLVER
 */
async function resolvePipedProvider(videoId, globalStats) {
  const triedInstances = new Set();
  const batchSize = 5;

  for (let pass = 1; pass <= 2; pass++) {
    const candidates = await pipedInstanceManager.discoverCandidates();
    globalStats.pipedDiscovered = candidates.length;

    const remaining = candidates.filter((c) => !triedInstances.has(c));
    if (remaining.length === 0 && pass > 1) break;

    for (let i = 0; i < remaining.length; i += batchSize) {
      const batch = remaining.slice(i, i + batchSize);
      batch.forEach((c) => triedInstances.add(c));

      console.log(`[PipedProvider] Testing candidate batch ${Math.floor(i / batchSize) + 1} (${batch.length} instances)...`);
      const results = await Promise.all(batch.map((inst) => fetchPipedCandidate(inst, videoId, globalStats)));
      const successful = results.find((r) => r !== null);
      if (successful) {
        return successful;
      }
    }
  }

  return null;
}

/**
 * Single candidate attempt for Invidious
 */
async function fetchInvidiousCandidate(instance, videoId, globalStats) {
  globalStats.invidiousAttempted++;
  const endpoint = `${instance}/api/v1/videos/${videoId}`;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'ClipFlow/1.0', 'Accept': 'application/json' },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      updateGlobalStats(null, res, globalStats);
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      globalStats.invalidResponses++;
      return null;
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      globalStats.invalidResponses++;
      return null;
    }

    if (data.error || !data || (!data.formatStreams && !data.adaptiveFormats)) {
      globalStats.invalidResponses++;
      return null;
    }

    const title = data.title || `YouTube Video ${videoId}`;
    const durationSeconds = Number(data.lengthSeconds) || 0;

    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    if (Array.isArray(data.videoThumbnails) && data.videoThumbnails.length > 0) {
      const bestThumb = data.videoThumbnails.find((t) => t.url && isAbsoluteHttpUrl(t.url)) || data.videoThumbnails[0];
      if (bestThumb?.url && isAbsoluteHttpUrl(bestThumb.url)) {
        thumbnailUrl = bestThumb.url;
      }
    }

    const formatStreams = Array.isArray(data.formatStreams) ? data.formatStreams : [];
    const adaptiveFormats = Array.isArray(data.adaptiveFormats) ? data.adaptiveFormats : [];

    let combinedUrl = null;
    let videoStreamUrl = null;
    let audioStreamUrl = null;

    // Select combined stream
    const bestCombined = formatStreams.find((s) => s.url && isAbsoluteHttpUrl(s.url) && (s.container === 'mp4' || s.type?.includes('mp4'))) ||
      formatStreams.find((s) => s.url && isAbsoluteHttpUrl(s.url));
    if (bestCombined?.url) {
      combinedUrl = bestCombined.url;
    }

    // Select video stream
    const bestVideo = adaptiveFormats.find((s) => s.url && isAbsoluteHttpUrl(s.url) && (s.type?.includes('video/mp4') || s.mimeType?.includes('video/mp4'))) ||
      adaptiveFormats.find((s) => s.url && isAbsoluteHttpUrl(s.url) && (s.type?.includes('video/') || s.mimeType?.includes('video/')));
    if (bestVideo?.url) {
      videoStreamUrl = bestVideo.url;
    }

    // Select audio stream
    const bestAudio = adaptiveFormats.find((s) => s.url && isAbsoluteHttpUrl(s.url) && (s.type?.includes('audio/mp4') || s.type?.includes('audio/m4a') || s.mimeType?.includes('audio/mp4'))) ||
      adaptiveFormats.find((s) => s.url && isAbsoluteHttpUrl(s.url) && (s.type?.includes('audio/') || s.mimeType?.includes('audio/')));
    if (bestAudio?.url) {
      audioStreamUrl = bestAudio.url;
    }

    if (!combinedUrl && !videoStreamUrl) {
      globalStats.noUsableStreams++;
      return null;
    }

    return {
      sourceVideoId: videoId,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoStreamUrl,
      audioStreamUrl,
      combinedUrl,
      durationSeconds,
      title,
      thumbnailUrl,
      provider: 'invidious',
      instanceUsed: instance,
      latencyMs,
    };
  } catch (err) {
    updateGlobalStats(err, null, globalStats);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * INVIDIOUS PROVIDER RESOLVER
 */
async function resolveInvidiousProvider(videoId, globalStats) {
  const candidates = await discoverInvidiousCandidates();
  globalStats.invidiousDiscovered = candidates.length;
  const batchSize = 5;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    console.log(`[InvidiousProvider] Testing candidate batch ${Math.floor(i / batchSize) + 1} (${batch.length} instances)...`);
    const results = await Promise.all(batch.map((inst) => fetchInvidiousCandidate(inst, videoId, globalStats)));
    const successful = results.find((r) => r !== null);
    if (successful) {
      return successful;
    }
  }

  return null;
}

export async function resolveStream(youtubeUrlOrId) {
  const videoId = extractYouTubeVideoId(youtubeUrlOrId);
  if (!videoId || videoId.length !== 11) {
    throw new Error(`[PIPED_INVALID_RESPONSE] Invalid YouTube video ID extracted from "${youtubeUrlOrId}"`);
  }

  const globalStats = {
    videoId,
    pipedDiscovered: 0,
    pipedAttempted: 0,
    pipedSuccess: 0,
    invidiousDiscovered: 0,
    invidiousAttempted: 0,
    invidiousSuccess: 0,
    timeouts: 0,
    http403: 0,
    http404: 0,
    http429: 0,
    http5xx: 0,
    dnsFailures: 0,
    tlsFailures: 0,
    invalidResponses: 0,
    noUsableStreams: 0,
  };

  // STEP 1: PIPED PROVIDER
  console.log(`[MultiProviderResolver] Attempting Piped provider for video ID: ${videoId}...`);
  try {
    const pipedResult = await resolvePipedProvider(videoId, globalStats);
    if (pipedResult) {
      globalStats.pipedSuccess = 1;
      console.log(`[MultiProviderResolver] SUCCESS via PIPED instance: ${pipedResult.instanceUsed} (${pipedResult.latencyMs}ms)`);
      return pipedResult;
    }
  } catch (pipedErr) {
    console.warn(`[MultiProviderResolver] Piped provider error: ${pipedErr.message}`);
  }

  // STEP 2: INVIDIOUS PROVIDER
  console.log(`[MultiProviderResolver] Falling back to Invidious provider for video ID: ${videoId}...`);
  try {
    const invidiousResult = await resolveInvidiousProvider(videoId, globalStats);
    if (invidiousResult) {
      globalStats.invidiousSuccess = 1;
      console.log(`[MultiProviderResolver] SUCCESS via INVIDIOUS instance: ${invidiousResult.instanceUsed} (${invidiousResult.latencyMs}ms)`);
      return invidiousResult;
    }
  } catch (invidiousErr) {
    console.warn(`[MultiProviderResolver] Invidious provider error: ${invidiousErr.message}`);
  }

  // STEP 3: FINAL DIAGNOSTIC ERROR
  const diagnosticMsg =
    `[PIPED_STREAM_RESOLUTION_FAILED] Neither Piped nor Invidious providers could resolve YouTube video ${videoId}.\n` +
    `Diagnostics: videoId=${globalStats.videoId}, pipedDiscovered=${globalStats.pipedDiscovered}, pipedAttempted=${globalStats.pipedAttempted}, pipedSuccess=${globalStats.pipedSuccess}, ` +
    `invidiousDiscovered=${globalStats.invidiousDiscovered}, invidiousAttempted=${globalStats.invidiousAttempted}, invidiousSuccess=${globalStats.invidiousSuccess}, ` +
    `timeouts=${globalStats.timeouts}, http403=${globalStats.http403}, http404=${globalStats.http404}, http429=${globalStats.http429}, http5xx=${globalStats.http5xx}, ` +
    `dnsFailures=${globalStats.dnsFailures}, tlsFailures=${globalStats.tlsFailures}, invalidResponses=${globalStats.invalidResponses}, noUsableStreams=${globalStats.noUsableStreams}.`;

  console.error(diagnosticMsg);
  throw new Error(diagnosticMsg);
}

// Backward compatibility aliases
export const resolvePipedStream = resolveStream;

export async function checkPipedHealth() {
  try {
    const candidates = await pipedInstanceManager.discoverCandidates();
    return {
      configured: true,
      reachable: candidates.length > 0,
      details: `${candidates.length} Piped instances available for stream resolution`,
      status: pipedInstanceManager.getStatus(),
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
