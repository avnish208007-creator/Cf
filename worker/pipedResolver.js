/**
 * Robust Multi-Provider YouTube Stream Resolver & Range-Probed Media Acquisition
 * Pure Node.js 20+ ES Module. Zero external package dependencies.
 *
 * Pipeline Architecture:
 *   resolveStream(videoId)
 *     ├── tryPipedProvider(videoId, stats)
 *     │     ├── GET {instance}/streams/{videoId}
 *     │     ├── readJsonResponse(res, 'piped', instance, stats)
 *     │     ├── normalizePipedCandidates(data, instance)
 *     │     └── probeAndSelectCandidate(candidates, stats)
 *     │
 *     └── tryInvidiousProvider(videoId, stats) [Fallback]
 *           ├── GET {instance}/api/v1/videos/{videoId}
 *           ├── readJsonResponse(res, 'invidious', instance, stats)
 *           ├── normalizeInvidiousCandidates(data, instance, videoId)
 *           └── probeAndSelectCandidate(candidates, stats)
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

function getUrlHost(url) {
  if (!url) return 'unknown';
  try {
    return new URL(url).hostname;
  } catch {
    return 'invalid-url';
  }
}

/**
 * LIGHTWEIGHT HTTP RANGE PROBE
 * Tests whether a stream URL is accessible and returns binary media bytes (200/206).
 */
export async function probeMediaStreamUrl(url, timeoutMs = 6000) {
  if (!url || !isAbsoluteHttpUrl(url)) {
    return { ok: false, status: 0, host: 'invalid', reason: 'Invalid or non-absolute URL' };
  }

  const host = getUrlHost(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Range': 'bytes=0-1023',
        'Accept': '*/*',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    const status = res.status;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      console.warn(`[MediaProbe] host=${host} status=${status} contentType=${contentType} -> REJECTED (Non-binary payload)`);
      return { ok: false, status, host, reason: `Non-binary payload (${contentType})` };
    }

    if (status === 200 || status === 206) {
      console.log(`[MediaProbe] host=${host} status=${status} contentType=${contentType} -> VERIFIED_ACCESSIBLE`);
      return { ok: true, status, host, contentType };
    }

    console.warn(`[MediaProbe] host=${host} status=${status} contentType=${contentType} -> REJECTED (HTTP ${status})`);
    return { ok: false, status, host, reason: `HTTP ${status}` };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'Timeout (>6s)' : err.message;
    console.warn(`[MediaProbe] host=${host} -> REJECTED (${reason})`);
    return { ok: false, status: 0, host, reason };
  } finally {
    clearTimeout(timer);
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
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          signal: controller.signal,
        });

        if (res.ok) {
          const text = await res.text();
          try {
            const data = JSON.parse(text);
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
          } catch {}
        }
      } catch {
        // Skip unavailable discovery source
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
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
        signal: controller.signal,
      });

      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
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
        } catch {}
      }
    } catch {
      // Skip unavailable discovery source
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

function updateStatsFromStatus(status, stats) {
  if (status === 401) stats.http401++;
  else if (status === 403) stats.http403++;
  else if (status === 404) stats.http404++;
  else if (status === 429) stats.http429++;
  else if (status >= 500) stats.http5xx++;
}

function updateStatsFromError(err, stats) {
  if (err.name === 'AbortError') stats.timeouts++;
  else if (err.message?.includes('CERT_') || err.message?.includes('SSL') || err.message?.includes('tls') || err.message?.includes('certificate')) stats.tlsFailures++;
  else if (err.message?.includes('ENOTFOUND') || err.message?.includes('EAI_AGAIN')) stats.dnsFailures++;
  else stats.invalidResponses++;
}

/**
 * Robust JSON response reader
 * Tolerates non-json Content-Type headers as long as JSON.parse succeeds.
 */
async function readJsonResponse(res, provider, instance, stats) {
  const status = res.status;
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const contentLength = res.headers.get('content-length') || 'unknown';

  if (!res.ok) {
    updateStatsFromStatus(status, stats);
    return null;
  }

  if (!contentType.includes('json')) {
    stats.nonJsonSuccessfulResponses++;
  }

  let text = '';
  try {
    text = await res.text();
  } catch (err) {
    stats.invalidResponses++;
    return null;
  }

  if (!text || text.trim().length === 0) {
    stats.emptyBodies++;
    return null;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    stats.jsonParseFailures++;
    stats.invalidResponses++;

    const logCounterKey = provider === 'piped' ? 'pipedInvalidLogCount' : 'invidiousInvalidLogCount';
    if (stats[logCounterKey] < 5) {
      stats[logCounterKey]++;
      const bodyPreview = text.slice(0, 300).replace(/[\r\n]+/g, ' ');
      console.warn(
        `[ProviderResponseInvalid]\n` +
        `  provider=${provider}\n` +
        `  instance=${instance}\n` +
        `  status=${status}\n` +
        `  contentType=${contentType}\n` +
        `  contentLength=${contentLength}\n` +
        `  bodyPreview=${bodyPreview}\n` +
        `  reason=JSON_PARSE_FAILED`
      );
    }
    return null;
  }

  // Safe structural logging for first successful JSON response
  if (provider === 'piped' && !stats.pipedShapeLogged && data) {
    stats.pipedShapeLogged = true;
    console.log(
      `[PipedResponseShape]\n` +
      `  instance=${instance}\n` +
      `  keys=${Object.keys(data).join(',')}\n` +
      `  videoStreams=${Array.isArray(data.videoStreams) ? data.videoStreams.length : 0}\n` +
      `  audioStreams=${Array.isArray(data.audioStreams) ? data.audioStreams.length : 0}\n` +
      `  hasUrl=${!!data.url}\n` +
      `  error=${data.error || 'none'}\n` +
      `  message=${data.message || 'none'}`
    );
  } else if (provider === 'invidious' && !stats.invidiousShapeLogged && data) {
    stats.invidiousShapeLogged = true;
    console.log(
      `[InvidiousResponseShape]\n` +
      `  instance=${instance}\n` +
      `  keys=${Object.keys(data).join(',')}\n` +
      `  formatStreams=${Array.isArray(data.formatStreams) ? data.formatStreams.length : 0}\n` +
      `  adaptiveFormats=${Array.isArray(data.adaptiveFormats) ? data.adaptiveFormats.length : 0}\n` +
      `  hasError=${!!data.error}`
    );
  }

  return data;
}

/**
 * NORMALIZATION LAYER - PIPED
 */
function normalizePipedCandidates(data, instance) {
  if (!data || typeof data !== 'object') return [];

  const title = data.title || `YouTube Video`;
  const durationSeconds = Number(data.duration) || 0;
  const thumbnailUrl = isAbsoluteHttpUrl(data.thumbnailUrl)
    ? data.thumbnailUrl
    : isAbsoluteHttpUrl(data.thumbnail)
    ? data.thumbnail
    : '';

  const candidates = [];

  // Combined stream from data.url
  if (data.url && typeof data.url === 'string' && isAbsoluteHttpUrl(data.url)) {
    candidates.push({
      provider: 'piped',
      instance,
      type: 'combined',
      url: data.url,
      videoUrl: null,
      audioUrl: null,
      title,
      durationSeconds,
      thumbnailUrl,
      mimeType: 'video/mp4',
      container: 'mp4',
      quality: 'default',
    });
  }

  const videoStreams = Array.isArray(data.videoStreams) ? data.videoStreams : [];
  const audioStreams = Array.isArray(data.audioStreams) ? data.audioStreams : [];

  // Combined streams from videoStreams array where videoOnly is not true
  for (const stream of videoStreams) {
    if (stream.url && isAbsoluteHttpUrl(stream.url) && stream.videoOnly !== true) {
      candidates.push({
        provider: 'piped',
        instance,
        type: 'combined',
        url: stream.url,
        videoUrl: null,
        audioUrl: null,
        title,
        durationSeconds,
        thumbnailUrl,
        mimeType: stream.mimeType || 'video/mp4',
        container: stream.format || 'mp4',
        quality: stream.quality || 'default',
      });
    }
  }

  // Separate video + audio streams
  const bestVideo = videoStreams.find((s) => s.url && isAbsoluteHttpUrl(s.url) && s.mimeType?.includes('video/mp4')) ||
    videoStreams.find((s) => s.url && isAbsoluteHttpUrl(s.url));

  const bestAudio = audioStreams.find((s) => s.url && isAbsoluteHttpUrl(s.url) && s.mimeType?.includes('audio/')) ||
    audioStreams.find((s) => s.url && isAbsoluteHttpUrl(s.url));

  if (bestVideo?.url && bestAudio?.url) {
    candidates.push({
      provider: 'piped',
      instance,
      type: 'separate',
      url: null,
      videoUrl: bestVideo.url,
      audioUrl: bestAudio.url,
      title,
      durationSeconds,
      thumbnailUrl,
      mimeType: bestVideo.mimeType || 'video/mp4',
      container: 'mp4',
      quality: bestVideo.quality || 'default',
    });
  }

  return candidates;
}

/**
 * Construct Invidious proxied media URL
 */
function buildInvidiousProxiedUrl(instance, rawUrl, itag = null, videoId = null) {
  if (!rawUrl) return null;

  if (rawUrl.startsWith('/')) {
    const connector = rawUrl.includes('?') ? '&' : '?';
    return `${instance}${rawUrl}${connector}local=true`;
  }

  if (itag && videoId) {
    return `${instance}/latest_version?id=${videoId}&itag=${itag}&local=true`;
  }

  if (rawUrl.includes('local=true')) {
    return rawUrl;
  }

  const connector = rawUrl.includes('?') ? '&' : '?';
  return `${rawUrl}${connector}local=true`;
}

/**
 * NORMALIZATION LAYER - INVIDIOUS
 */
function normalizeInvidiousCandidates(data, instance, videoId) {
  if (!data || typeof data !== 'object') return [];

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

  const candidates = [];

  // Combined streams from formatStreams
  for (const stream of formatStreams) {
    if (!stream.url) continue;

    const proxiedUrl = buildInvidiousProxiedUrl(instance, stream.url, stream.itag, videoId);
    const rawUrl = isAbsoluteHttpUrl(stream.url) ? stream.url : `${instance}${stream.url}`;

    if (proxiedUrl && isAbsoluteHttpUrl(proxiedUrl)) {
      candidates.push({
        provider: 'invidious',
        instance,
        type: 'combined',
        url: proxiedUrl,
        videoUrl: null,
        audioUrl: null,
        title,
        durationSeconds,
        thumbnailUrl,
        mimeType: 'video/mp4',
        container: stream.container || 'mp4',
        quality: stream.quality || 'default',
      });
    }

    if (rawUrl && isAbsoluteHttpUrl(rawUrl) && rawUrl !== proxiedUrl) {
      candidates.push({
        provider: 'invidious',
        instance,
        type: 'combined',
        url: rawUrl,
        videoUrl: null,
        audioUrl: null,
        title,
        durationSeconds,
        thumbnailUrl,
        mimeType: 'video/mp4',
        container: stream.container || 'mp4',
        quality: stream.quality || 'default',
      });
    }
  }

  // Separate video + audio streams from adaptiveFormats
  const bestVideo = adaptiveFormats.find((s) => s.url && (s.type?.includes('video/mp4') || s.mimeType?.includes('video/mp4'))) ||
    adaptiveFormats.find((s) => s.url && (s.type?.includes('video/') || s.mimeType?.includes('video/')));

  const bestAudio = adaptiveFormats.find((s) => s.url && (s.type?.includes('audio/mp4') || s.type?.includes('audio/m4a') || s.mimeType?.includes('audio/mp4'))) ||
    adaptiveFormats.find((s) => s.url && (s.type?.includes('audio/') || s.mimeType?.includes('audio/')));

  if (bestVideo?.url && bestAudio?.url) {
    const proxiedVideo = buildInvidiousProxiedUrl(instance, bestVideo.url, bestVideo.itag, videoId);
    const proxiedAudio = buildInvidiousProxiedUrl(instance, bestAudio.url, bestAudio.itag, videoId);

    if (proxiedVideo && proxiedAudio && isAbsoluteHttpUrl(proxiedVideo) && isAbsoluteHttpUrl(proxiedAudio)) {
      candidates.push({
        provider: 'invidious',
        instance,
        type: 'separate',
        url: null,
        videoUrl: proxiedVideo,
        audioUrl: proxiedAudio,
        title,
        durationSeconds,
        thumbnailUrl,
        mimeType: 'video/mp4',
        container: 'mp4',
        quality: bestVideo.qualityLabel || 'default',
      });
    }
  }

  return candidates;
}

/**
 * CANDIDATE PROBING & SELECTION LAYER
 */
async function probeAndSelectCandidate(candidates, instance, stats) {
  if (!candidates || candidates.length === 0) return null;

  stats.candidatesResolved += candidates.length;

  for (const candidate of candidates) {
    if (candidate.type === 'combined') {
      stats.candidatesProbed++;
      const probe = await probeMediaStreamUrl(candidate.url);
      if (probe.ok) {
        stats.candidatesDownloadable++;
        return candidate;
      }
      updateStatsFromStatus(probe.status, stats);
    } else if (candidate.type === 'separate') {
      stats.candidatesProbed += 2;
      const [vProbe, aProbe] = await Promise.all([
        probeMediaStreamUrl(candidate.videoUrl),
        probeMediaStreamUrl(candidate.audioUrl),
      ]);

      if (vProbe.ok && aProbe.ok) {
        stats.candidatesDownloadable++;
        return candidate;
      }

      if (!vProbe.ok) updateStatsFromStatus(vProbe.status, stats);
      if (!aProbe.ok) updateStatsFromStatus(aProbe.status, stats);
    }
  }

  return null;
}

/**
 * PIPED PROVIDER ENGINE
 */
async function tryPipedProvider(videoId, stats) {
  const triedInstances = new Set();
  const batchSize = 10;

  for (let pass = 1; pass <= 2; pass++) {
    const candidates = await pipedInstanceManager.discoverCandidates();
    stats.pipedDiscovered = candidates.length;

    const remaining = candidates.filter((c) => !triedInstances.has(c));
    if (remaining.length === 0 && pass > 1) break;

    for (let i = 0; i < remaining.length; i += batchSize) {
      const batch = remaining.slice(i, i + batchSize);
      batch.forEach((c) => triedInstances.add(c));

      console.log(`[PipedProvider] Testing candidate batch ${Math.floor(i / batchSize) + 1} (${batch.length} instances)...`);

      const settled = await Promise.allSettled(
        batch.map(async (instance) => {
          stats.pipedAttempted++;
          const endpoint = `${instance}/streams/${videoId}`;
          const start = Date.now();
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);

          try {
            const res = await fetch(endpoint, {
              headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
              signal: controller.signal,
            });
            const latencyMs = Date.now() - start;

            const data = await readJsonResponse(res, 'piped', instance, stats);
            if (!data) {
              pipedInstanceManager.recordFailure(instance, `HTTP ${res.status} or invalid JSON body`);
              return null;
            }

            if ((data.error || data.message) && !data.videoStreams && !data.url) {
              stats.providerApiErrors++;
              pipedInstanceManager.recordFailure(instance, `API Error: ${data.error || data.message}`);
              return null;
            }

            const normalizedCandidates = normalizePipedCandidates(data, instance);
            if (normalizedCandidates.length === 0) {
              stats.noUsableStreams++;
              pipedInstanceManager.recordFailure(instance, 'No stream candidates found in JSON');
              return null;
            }

            const selected = await probeAndSelectCandidate(normalizedCandidates, instance, stats);
            if (selected) {
              pipedInstanceManager.recordSuccess(instance, latencyMs);
              return { selected, latencyMs };
            }

            pipedInstanceManager.recordFailure(instance, 'Probing failed for candidate streams');
            return null;
          } catch (err) {
            updateStatsFromError(err, stats);
            pipedInstanceManager.recordFailure(instance, err.message);
            return null;
          } finally {
            clearTimeout(timer);
          }
        })
      );

      for (const item of settled) {
        if (item.status === 'fulfilled' && item.value?.selected) {
          const { selected, latencyMs } = item.value;
          return {
            sourceVideoId: videoId,
            sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
            videoStreamUrl: selected.videoUrl,
            audioStreamUrl: selected.audioUrl,
            combinedUrl: selected.url,
            durationSeconds: selected.durationSeconds,
            title: selected.title,
            thumbnailUrl: selected.thumbnailUrl,
            provider: 'piped',
            instanceUsed: selected.instance,
            latencyMs,
          };
        }
      }
    }
  }

  return null;
}

/**
 * INVIDIOUS PROVIDER ENGINE
 */
async function tryInvidiousProvider(videoId, stats) {
  const candidates = await discoverInvidiousCandidates();
  stats.invidiousDiscovered = candidates.length;
  const batchSize = 10;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    console.log(`[InvidiousProvider] Testing candidate batch ${Math.floor(i / batchSize) + 1} (${batch.length} instances)...`);

    const settled = await Promise.allSettled(
      batch.map(async (instance) => {
        stats.invidiousAttempted++;
        const endpoint = `${instance}/api/v1/videos/${videoId}`;
        const start = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        try {
          const res = await fetch(endpoint, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
            signal: controller.signal,
          });
          const latencyMs = Date.now() - start;

          const data = await readJsonResponse(res, 'invidious', instance, stats);
          if (!data) {
            return null;
          }

          if (data.error) {
            stats.providerApiErrors++;
            return null;
          }

          const normalizedCandidates = normalizeInvidiousCandidates(data, instance, videoId);
          if (normalizedCandidates.length === 0) {
            stats.noUsableStreams++;
            return null;
          }

          const selected = await probeAndSelectCandidate(normalizedCandidates, instance, stats);
          if (selected) {
            return { selected, latencyMs };
          }

          return null;
        } catch (err) {
          updateStatsFromError(err, stats);
          return null;
        } finally {
          clearTimeout(timer);
        }
      })
    );

    for (const item of settled) {
      if (item.status === 'fulfilled' && item.value?.selected) {
        const { selected, latencyMs } = item.value;
        return {
          sourceVideoId: videoId,
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          videoStreamUrl: selected.videoUrl,
          audioStreamUrl: selected.audioUrl,
          combinedUrl: selected.url,
          durationSeconds: selected.durationSeconds,
          title: selected.title,
          thumbnailUrl: selected.thumbnailUrl,
          provider: 'invidious',
          instanceUsed: selected.instance,
          latencyMs,
        };
      }
    }
  }

  return null;
}

export async function resolveStream(youtubeUrlOrId) {
  const videoId = extractYouTubeVideoId(youtubeUrlOrId);
  if (!videoId || videoId.length !== 11) {
    throw new Error(`[STREAM_RESOLUTION_FAILED] Invalid YouTube video ID extracted from "${youtubeUrlOrId}"`);
  }

  const stats = {
    videoId,
    pipedDiscovered: 0,
    pipedAttempted: 0,
    pipedSuccess: 0,
    invidiousDiscovered: 0,
    invidiousAttempted: 0,
    invidiousSuccess: 0,
    candidatesResolved: 0,
    candidatesProbed: 0,
    candidatesDownloadable: 0,
    providerApiErrors: 0,
    jsonParseFailures: 0,
    nonJsonSuccessfulResponses: 0,
    emptyBodies: 0,
    invalidResponses: 0,
    noUsableStreams: 0,
    timeouts: 0,
    http401: 0,
    http403: 0,
    http404: 0,
    http429: 0,
    http5xx: 0,
    dnsFailures: 0,
    tlsFailures: 0,
    pipedInvalidLogCount: 0,
    invidiousInvalidLogCount: 0,
    pipedShapeLogged: false,
    invidiousShapeLogged: false,
  };

  // STEP 1: PIPED PROVIDER
  console.log(`[MultiProviderResolver] Attempting Piped provider for video ID: ${videoId}...`);
  try {
    const pipedResult = await tryPipedProvider(videoId, stats);
    if (pipedResult) {
      stats.pipedSuccess = 1;
      console.log(`[MultiProviderResolver] SUCCESS via PIPED instance: ${pipedResult.instanceUsed} (${pipedResult.latencyMs}ms)`);
      return pipedResult;
    }
  } catch (pipedErr) {
    console.warn(`[MultiProviderResolver] Piped provider error: ${pipedErr.message}`);
  }

  // STEP 2: INVIDIOUS PROVIDER
  console.log(`[MultiProviderResolver] Falling back to Invidious provider for video ID: ${videoId}...`);
  try {
    const invidiousResult = await tryInvidiousProvider(videoId, stats);
    if (invidiousResult) {
      stats.invidiousSuccess = 1;
      console.log(`[MultiProviderResolver] SUCCESS via INVIDIOUS instance: ${invidiousResult.instanceUsed} (${invidiousResult.latencyMs}ms)`);
      return invidiousResult;
    }
  } catch (invidiousErr) {
    console.warn(`[MultiProviderResolver] Invidious provider error: ${invidiousErr.message}`);
  }

  // STEP 3: FINAL DIAGNOSTIC ERROR
  const diagnosticMsg =
    `[STREAM_RESOLUTION_FAILED] Neither Piped nor Invidious providers could resolve a downloadable stream for YouTube video ${videoId}.\n` +
    `Diagnostics:\n` +
    `  videoId=${stats.videoId}\n` +
    `  pipedDiscovered=${stats.pipedDiscovered}, pipedAttempted=${stats.pipedAttempted}, pipedSuccess=${stats.pipedSuccess}\n` +
    `  invidiousDiscovered=${stats.invidiousDiscovered}, invidiousAttempted=${stats.invidiousAttempted}, invidiousSuccess=${stats.invidiousSuccess}\n` +
    `  candidatesResolved=${stats.candidatesResolved}, candidatesProbed=${stats.candidatesProbed}, candidatesDownloadable=${stats.candidatesDownloadable}\n` +
    `  providerApiErrors=${stats.providerApiErrors}, jsonParseFailures=${stats.jsonParseFailures}, nonJsonSuccessfulResponses=${stats.nonJsonSuccessfulResponses}, emptyBodies=${stats.emptyBodies}, invalidResponses=${stats.invalidResponses}, noUsableStreams=${stats.noUsableStreams}\n` +
    `  timeouts=${stats.timeouts}, http401=${stats.http401}, http403=${stats.http403}, http404=${stats.http404}, http429=${stats.http429}, http5xx=${stats.http5xx}\n` +
    `  dnsFailures=${stats.dnsFailures}, tlsFailures=${stats.tlsFailures}`;

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
