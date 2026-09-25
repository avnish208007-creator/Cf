import https from 'https';
import { DiscoveredVideo, DiscoveryQueryContext, IDiscoveryProvider } from './types';

/**
 * RSS Discovery Provider for YouTube Channel Feeds
 * Fetches https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
 * Extracts real video entries, IDs, titles, publication timestamps, and thumbnails.
 * Does not fabricate duration, view counts, or relevance scores.
 * Only returns videos when the channel matches the niche.
 */
export class RssDiscoveryProvider implements IDiscoveryProvider {
  public readonly name = 'rss-channel-feed';

  public async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    return { available: true };
  }

  public async search(context: DiscoveryQueryContext & { channelIds?: string[] }): Promise<DiscoveredVideo[]> {
    const channelIds = context.channelIds || this.getChannelIdsForNiche(context.niche);
    if (!channelIds || channelIds.length === 0) {
      return []; // Return empty if niche has no mapped channels, avoiding cross-contamination
    }

    const discoveredVideos: DiscoveredVideo[] = [];

    for (const channelId of channelIds) {
      try {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const xmlData = await this.fetchUrl(feedUrl);
        const entries = this.parseRssXml(xmlData);

        for (const entry of entries) {
          if (!entry.videoId || entry.videoId.length !== 11) continue;

          discoveredVideos.push({
            id: entry.videoId,
            title: entry.title || 'YouTube Creator Video',
            channelTitle: entry.channelTitle || 'YouTube Creator',
            duration: '',
            durationSeconds: 0,
            viewCount: 0,
            publishedAt: entry.published || 'Recently Published',
            youtubeUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
            summary: `Latest video feed release from channel ${entry.channelTitle || channelId}.`,
            description: `RSS feed discovered release for ${entry.title}`,
            niche: context.niche,
            relevanceScore: 0,
            thumbnailUrl: `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`,
            thumbnailGradient: 'from-slate-900 via-indigo-950 to-slate-900',
            isSyntheticData: false,
            is_development_source: false,
            isDevelopmentSource: false,
          });
        }
      } catch (err: any) {
        console.warn(`[RssDiscoveryProvider] Failed to fetch RSS feed for channel ${channelId}:`, err.message);
      }
    }

    return discoveredVideos;
  }

  private getChannelIdsForNiche(niche: string): string[] {
    const n = (niche || '').toLowerCase();
    if (n.includes('ai') || n.includes('tech') || n.includes('coding') || n.includes('software') || n.includes('developer')) {
      return [
        'UCWOA1ZGywLbqmigxE4Qlvuw', // Two Minute Papers
        'UCWN3xxRkmTPmbKwht9FuEKA', // Fireship
        'UCvjgXvBlbQiydffZU7m1_aw', // Lex Fridman
      ];
    }
    if (n.includes('fitness') || n.includes('gym') || n.includes('workout') || n.includes('health') || n.includes('bodybuilding')) {
      return [
        'UCqjwF8rxRsihXgqKxlq1M1g', // Athlean-X
        'UC7sDT8jZt6VLVYZI_wG6N6Q', // Jeff Nippard
      ];
    }
    if (n.includes('finance') || n.includes('money') || n.includes('crypto') || n.includes('investing') || n.includes('stocks')) {
      return [
        'UCCJQpAc3vuqWpA9pB_H9Qdw', // Graham Stephan
        'UCGyET_adtNNn1A3P03q54_w', // Meet Kevin
      ];
    }
    // Unrelated or unspecified niche returns empty array (no fabricated cross-niche feeds)
    return [];
  }

  private fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ClipFlowRSS/1.0)',
            'Accept': 'application/rss+xml, application/xml, text/xml',
          },
          timeout: 10000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
        }
      ).on('error', reject);
    });
  }

  private parseRssXml(xml: string): Array<{ videoId: string; title: string; channelTitle: string; published: string }> {
    const results: Array<{ videoId: string; title: string; channelTitle: string; published: string }> = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entryText = match[1];
      const videoIdMatch = entryText.match(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/);
      const titleMatch = entryText.match(/<title>(.*?)<\/title>/);
      const authorMatch = entryText.match(/<name>(.*?)<\/name>/);
      const publishedMatch = entryText.match(/<published>(.*?)<\/published>/);

      if (videoIdMatch) {
        const videoId = videoIdMatch[1];
        const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : 'YouTube Video';
        const channelTitle = authorMatch ? authorMatch[1].trim() : 'YouTube Creator';
        const published = publishedMatch ? new Date(publishedMatch[1]).toLocaleDateString() : 'Recently';

        results.push({ videoId, title, channelTitle, published });
      }
    }

    return results;
  }
}
