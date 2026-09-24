import { ExtractedContent, VideoChapter } from './types';
import { ITranscriptProvider, YouTubeTranscriptProvider } from './TranscriptProvider';

export interface IContentExtractor {
  extractContent(source: {
    id: string;
    youtubeUrl: string;
    title: string;
    channelTitle: string;
    description?: string;
    summary?: string;
  }): Promise<ExtractedContent>;
}

export class ModularContentExtractor implements IContentExtractor {
  private transcriptProvider: ITranscriptProvider;

  constructor(transcriptProvider?: ITranscriptProvider) {
    this.transcriptProvider = transcriptProvider || new YouTubeTranscriptProvider();
  }

  public async extractContent(source: {
    id: string;
    youtubeUrl: string;
    title: string;
    channelTitle: string;
    description?: string;
    summary?: string;
  }): Promise<ExtractedContent> {
    const videoId = this.extractVideoId(source.youtubeUrl || source.id);
    if (!videoId) {
      return {
        hasContent: false,
        contentType: 'none',
        videoId: source.id,
        videoTitle: source.title,
        channelTitle: source.channelTitle,
        description: '',
        fullText: '',
        reason: 'Content unavailable for analysis: Invalid YouTube URL or ID.',
      };
    }

    // Step 1: Prefer available transcript/captions
    try {
      const transcriptResult = await this.transcriptProvider.fetchTranscript(videoId);
      if (transcriptResult.available && transcriptResult.segments && transcriptResult.segments.length > 0) {
        const fullText = transcriptResult.rawText || transcriptResult.segments.map((s) => s.text).join(' ');
        if (fullText.trim().length > 60) {
          return {
            hasContent: true,
            contentType: 'transcript',
            videoId,
            videoTitle: source.title,
            channelTitle: source.channelTitle,
            description: source.description || '',
            fullText,
            transcriptSegments: transcriptResult.segments,
          };
        }
      }
    } catch (err) {
      console.warn(`[ContentExtractor] Transcript check error for ${videoId}:`, err);
    }

    // Step 2: Fall back to legitimately available textual metadata (watch page metadata, chapters, detailed description)
    const metadata = await this.fetchLegitimateTextualMetadata(videoId, source);

    if (metadata.hasContent) {
      return {
        hasContent: true,
        contentType: 'textual_metadata',
        videoId,
        videoTitle: source.title,
        channelTitle: source.channelTitle,
        description: metadata.description,
        fullText: metadata.fullText,
        chapters: metadata.chapters,
      };
    }

    // Step 3: Content unavailable
    return {
      hasContent: false,
      contentType: 'none',
      videoId,
      videoTitle: source.title,
      channelTitle: source.channelTitle,
      description: source.description || '',
      fullText: '',
      reason: 'Content unavailable for analysis: No public transcript or chapter outline available for this video.',
    };
  }

  /**
   * Extracts legitimately available metadata (chapters and description) from YouTube's public watch page
   */
  private async fetchLegitimateTextualMetadata(
    videoId: string,
    fallbackSource: { title: string; description?: string; summary?: string }
  ): Promise<{ hasContent: boolean; description: string; fullText: string; chapters: VideoChapter[] }> {
    let rawDescription = fallbackSource.description || '';
    let chapters: VideoChapter[] = [];

    // Clean summary if description is not explicitly present
    if (!rawDescription && fallbackSource.summary) {
      rawDescription = fallbackSource.summary
        .replace(/^\[CLIPFLOW_META:[^\]]+\]\s*/, '')
        .replace(/\(Scores:.*?\)/, '')
        .trim();
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (resp.ok) {
        const html = await resp.text();

        // 1. Extract description meta tag if richer
        const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
        if (descMatch && descMatch[1] && descMatch[1].length > rawDescription.length) {
          rawDescription = this.unescapeHtml(descMatch[1]);
        }

        // 2. Extract chapters / timestamped outline from HTML / initial data
        const extractedChapters = this.parseChaptersFromText(html);
        if (extractedChapters.length > 0) {
          chapters = extractedChapters;
        }
      }
    } catch {
      // If fetching fails, fall back to existing stored description
    }

    // Also check description for timestamped chapters
    if (chapters.length === 0 && rawDescription) {
      chapters = this.parseChaptersFromText(rawDescription);
    }

    // Determine whether content is substantively usable
    const cleanDesc = rawDescription.replace(/https?:\/\/[^\s]+/g, '').trim();
    const hasChapters = chapters.length >= 2;
    const hasRichDescription = cleanDesc.length >= 80;

    if (!hasChapters && !hasRichDescription) {
      return {
        hasContent: false,
        description: rawDescription,
        fullText: '',
        chapters: [],
      };
    }

    // Build structured textual representation
    let fullText = `Title: ${fallbackSource.title}\n`;
    if (cleanDesc) {
      fullText += `Description: ${cleanDesc}\n`;
    }
    if (chapters.length > 0) {
      fullText += `Timestamped Chapters:\n`;
      chapters.forEach((ch) => {
        fullText += `- [${ch.startTimeStr}] ${ch.title}\n`;
      });
    }

    return {
      hasContent: true,
      description: rawDescription,
      fullText,
      chapters,
    };
  }

  private parseChaptersFromText(text: string): VideoChapter[] {
    const chapters: VideoChapter[] = [];
    const seenTimes = new Set<string>();

    // Matches e.g. "01:23 - Chapter Title" or "0:45 Intro"
    const regex = /(?:^|\n|\r|["'])(?:(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—:]?\s+([^\n\r"']{3,80}))/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const timeStr = match[1].trim();
      const rawTitle = match[2].trim().replace(/^[-–—:]\s*/, '');

      if (!seenTimes.has(timeStr) && rawTitle.length > 2 && !rawTitle.toLowerCase().includes('http')) {
        seenTimes.add(timeStr);
        chapters.push({
          startTimeStr: timeStr,
          startSeconds: this.timeStrToSeconds(timeStr),
          title: this.unescapeHtml(rawTitle),
        });
      }
    }

    return chapters.sort((a, b) => a.startSeconds - b.startSeconds);
  }

  private timeStrToSeconds(str: string): number {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }

  private extractVideoId(urlOrId: string): string {
    const trimmed = (urlOrId || '').trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
    );
    return match ? match[1] : trimmed;
  }

  private unescapeHtml(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }
}
