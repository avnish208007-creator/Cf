import { TranscriptResult, TranscriptSegment } from './types';
import { YoutubeTranscript } from 'youtube-transcript';

export interface ITranscriptProvider {
  readonly name: string;
  fetchTranscript(videoId: string): Promise<TranscriptResult>;
}

/**
 * YouTube Transcript Provider
 * Attempts legitimate retrieval of public captions/subtitles without bypassing restrictions.
 * If captions are disabled or unavailable, reports honest availability status.
 */
export class YouTubeTranscriptProvider implements ITranscriptProvider {
  public readonly name = 'youtube_captions';

  public async fetchTranscript(videoId: string): Promise<TranscriptResult> {
    const cleanId = this.cleanVideoId(videoId);
    if (!cleanId) {
      return {
        available: false,
        source: 'none',
        reason: 'Invalid video ID provided',
      };
    }

    // 1. Attempt using official/public transcript track via youtube-transcript
    try {
      const items = await YoutubeTranscript.fetchTranscript(cleanId);
      if (Array.isArray(items) && items.length > 0) {
        const segments: TranscriptSegment[] = items.map((item) => ({
          start: Math.round(item.offset / 1000),
          duration: Math.round(item.duration / 1000),
          text: this.cleanHtmlEntities(item.text),
        }));

        const rawText = segments.map((s) => s.text).join(' ');

        return {
          available: true,
          source: 'captions',
          segments,
          rawText,
        };
      }
    } catch (err: any) {
      // Gracefully handle YouTube caption unavailability / restrictions
      const msg = err?.message || String(err);
      if (msg.includes('disabled') || msg.includes('No transcripts') || msg.includes('unavailable')) {
        return {
          available: false,
          source: 'none',
          reason: 'Captions are disabled or not provided for this video',
        };
      }
      if (msg.includes('TooManyRequest') || msg.includes('captcha')) {
        return {
          available: false,
          source: 'none',
          reason: 'YouTube transcript rate limit encountered',
        };
      }
    }

    return {
      available: false,
      source: 'none',
      reason: 'No public transcript track found',
    };
  }

  private cleanVideoId(urlOrId: string): string {
    const trimmed = (urlOrId || '').trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
    );
    return match ? match[1] : trimmed;
  }

  private cleanHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/\n/g, ' ')
      .trim();
  }
}
