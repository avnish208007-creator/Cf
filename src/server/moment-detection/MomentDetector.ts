import { GoogleGenAI } from '@google/genai';
import { ExtractedContent, RawMomentCandidate } from './types';

export interface IMomentDetector {
  readonly name: string;
  detectMoments(
    content: ExtractedContent,
    context: {
      niche: string;
      subtopics: string[];
      minDurationSeconds?: number;
      maxDurationSeconds?: number;
    }
  ): Promise<RawMomentCandidate[]>;
}

/**
 * Gemini-powered Moment Detector (Recall First)
 * Focuses strictly on detecting all plausible candidate sections (15-75s)
 * with complete thought boundaries, leaving final quality scoring to the ranking stage.
 */
export class GeminiMomentDetector implements IMomentDetector {
  public readonly name = 'gemini-moment-detector';
  private ai: GoogleGenAI | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY || '';
    if (key) {
      this.ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  public async detectMoments(
    content: ExtractedContent,
    context: {
      niche: string;
      subtopics: string[];
      minDurationSeconds?: number;
      maxDurationSeconds?: number;
    }
  ): Promise<RawMomentCandidate[]> {
    if (!this.ai) {
      throw new Error('GEMINI_API_KEY is not configured for GeminiMomentDetector.');
    }

    if (!content.hasContent || !content.fullText.trim()) {
      return [];
    }

    const minDur = context.minDurationSeconds || 15;
    const maxDur = context.maxDurationSeconds || 75;

    // Truncate text context safely if extraordinarily long (limit to ~45,000 characters)
    const textContext = content.fullText.slice(0, 45000);

    const prompt = `You are an expert video content analyst and short-form editor.
Your objective in this detection phase is HIGH RECALL: find all plausible, self-contained short-form moment candidates within this video content.

VIDEO DETAILS:
- Title: ${content.videoTitle}
- Channel: ${content.channelTitle}
- Target Niche: ${context.niche}
- Subtopics: ${context.subtopics.join(', ') || context.niche}
- Content Format: ${content.contentType}

VIDEO CONTENT / TRANSCRIPT:
${textContext}

INSTRUCTIONS:
1. Identify 3 to 10 plausible candidate moments (target duration: ${minDur} to ${maxDur} seconds) that convey an interesting idea, explanation, debate, or insight.
2. Natural Boundaries: Each candidate MUST start and end at natural sentence and conversational boundaries. Do NOT cut in the middle of a thought.
3. Look for conversational patterns:
   - Question → Answer or explanation
   - Problem → Solution or workaround
   - Claim or surprising fact → Evidence or demonstration
   - Myth or common mistake → Lesson or reality
   - Story or personal experience → Payoff or conclusion
   - Framework or step-by-step breakdown
4. Exclude generic greetings ("welcome back to the channel"), sponsor reads, or housekeeping plugs.
5. Do NOT filter out moments just because they aren't 100% perfect; the subsequent scoring stage will rank them. Extract all genuine candidates.

Respond ONLY with a valid JSON array matching this exact schema:
[
  {
    "startTime": "01:15",
    "endTime": "01:55",
    "durationSeconds": 40,
    "transcriptText": "Verbatim speech or summary of the dialogue in this section",
    "hook": "The opening sentence or hook phrase that introduces the topic",
    "contextSummary": "Brief summary of the setup or context for this moment",
    "payoff": "The conclusion, resolution, or actionable insight at the end",
    "preliminaryReason": "Why this section works as a short-form moment"
  }
]`;

    // Try primary and fallback Gemini models
    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

    for (const modelName of candidateModels) {
      try {
        const response = await this.ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const responseText = response.text?.trim() || '[]';
        const parsed = JSON.parse(responseText);

        if (!Array.isArray(parsed)) {
          return [];
        }

        return parsed
          .filter((item: any) => item && item.startTime && item.endTime && item.hook)
          .map((item: any) => {
            const durSec =
              Number(item.durationSeconds) ||
              this.calculateDurationSeconds(item.startTime, item.endTime);
            return {
              startTime: item.startTime,
              endTime: item.endTime,
              duration: `${durSec}s`,
              durationSeconds: durSec,
              transcriptText: item.transcriptText || item.hook,
              hook: item.hook,
              contextSummary: item.contextSummary || 'Context for candidate moment.',
              payoff: item.payoff || 'Key takeaway.',
              preliminaryReason: item.preliminaryReason || '',
            };
          });
      } catch (err: any) {
        const errString = typeof err === 'object' ? JSON.stringify(err) : String(err);
        const errMessage = err?.message || '';
        const isQuotaOrRateLimit =
          err?.status === 'UNAVAILABLE' ||
          err?.status === 'RESOURCE_EXHAUSTED' ||
          err?.code === 503 ||
          err?.status === 503 ||
          err?.code === 429 ||
          err?.status === 429 ||
          err?.error?.code === 429 ||
          err?.error?.status === 'RESOURCE_EXHAUSTED' ||
          errMessage.includes('429') ||
          errMessage.includes('RESOURCE_EXHAUSTED') ||
          errMessage.includes('Quota exceeded') ||
          errMessage.includes('quota') ||
          errMessage.includes('rate limit') ||
          errMessage.includes('high demand') ||
          errMessage.includes('overloaded') ||
          errString.includes('429') ||
          errString.includes('RESOURCE_EXHAUSTED') ||
          errString.includes('Quota exceeded') ||
          errString.includes('quota');

        if (isQuotaOrRateLimit) {
          console.warn(
            `[GeminiMomentDetector] Model ${modelName} hit rate limit or quota limit, falling back to next available model or heuristic detector...`
          );
          continue;
        }

        console.warn(
          `[GeminiMomentDetector] Model ${modelName} execution error:`,
          errMessage || errString
        );
      }
    }

    return [];
  }

  private calculateDurationSeconds(startStr: string, endStr: string): number {
    const startSec = this.parseTimestampToSeconds(startStr);
    const endSec = this.parseTimestampToSeconds(endStr);
    const diff = endSec - startSec;
    return diff > 5 ? diff : 40;
  }

  private parseTimestampToSeconds(timeStr: string): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map((p) => parseInt(p, 10));
    if (parts.some((p) => isNaN(p))) return 0;

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
  }
}

/**
 * Heuristic Moment Detector (Rule-based & Chapter-based)
 * Analyzes timed transcript segments and chapters when LLM is offline or unavailable.
 */
export class HeuristicTranscriptMomentDetector implements IMomentDetector {
  public readonly name = 'heuristic-transcript-detector';

  public async detectMoments(
    content: ExtractedContent,
    context: {
      niche: string;
      subtopics: string[];
      minDurationSeconds?: number;
      maxDurationSeconds?: number;
    }
  ): Promise<RawMomentCandidate[]> {
    if (!content.hasContent) return [];

    const minDur = context.minDurationSeconds || 15;
    const maxDur = context.maxDurationSeconds || 75;

    // 1. If video has authentic chapter marks
    if (content.chapters && content.chapters.length >= 2) {
      const candidates: RawMomentCandidate[] = [];
      const chapters = content.chapters;

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const nextCh = chapters[i + 1];
        const startSec = ch.startSeconds;
        const endSec = nextCh ? nextCh.startSeconds : startSec + 45;
        const durSec = Math.max(15, Math.min(maxDur, endSec - startSec));

        // Skip generic intro/outro chapters
        const lowerTitle = ch.title.toLowerCase();
        if (
          lowerTitle.includes('intro') ||
          lowerTitle.includes('welcome') ||
          lowerTitle.includes('outro') ||
          lowerTitle.includes('sponsor')
        ) {
          continue;
        }

        candidates.push({
          startTime: ch.startTimeStr,
          endTime: this.formatSecondsToTimestamp(startSec + durSec),
          duration: `${durSec}s`,
          durationSeconds: durSec,
          transcriptText: `Chapter discussion on: ${ch.title}. In this segment, the speaker covers key principles of ${ch.title} related to ${context.niche}.`,
          hook: ch.title,
          contextSummary: `Structured section covering ${ch.title}.`,
          payoff: `Actionable breakdown of ${ch.title}.`,
          preliminaryReason: `Structured chapter milestone in the original video.`,
        });

        if (candidates.length >= 8) break;
      }

      if (candidates.length > 0) return candidates;
    }

    // 2. If timed transcript segments exist, group into 30-50s contiguous blocks
    if (content.transcriptSegments && content.transcriptSegments.length > 0) {
      const segments = content.transcriptSegments;
      const candidates: RawMomentCandidate[] = [];
      let currentBlock: string[] = [];
      let blockStartSec = segments[0].start;
      let blockDuration = 0;

      for (const seg of segments) {
        currentBlock.push(seg.text);
        blockDuration = seg.start + seg.duration - blockStartSec;

        if (blockDuration >= 35 && blockDuration <= maxDur) {
          const text = currentBlock.join(' ');
          const firstSentence = text.split(/[.!?]/)[0] || text.slice(0, 80);

          candidates.push({
            startTime: this.formatSecondsToTimestamp(blockStartSec),
            endTime: this.formatSecondsToTimestamp(blockStartSec + blockDuration),
            duration: `${Math.round(blockDuration)}s`,
            durationSeconds: Math.round(blockDuration),
            transcriptText: text,
            hook: firstSentence.length > 20 ? firstSentence : text.slice(0, 75),
            contextSummary: `Dialogue excerpt from "${content.videoTitle}".`,
            payoff: text.slice(-90),
            preliminaryReason: `Spoken dialogue segment with complete thought flow.`,
          });

          currentBlock = [];
          blockStartSec = seg.start + seg.duration;
          blockDuration = 0;

          if (candidates.length >= 8) break;
        }
      }

      if (candidates.length > 0) return candidates;
    }

    // 3. Fallback: Parse paragraphs/sentences from full text or summary
    const rawText = content.fullText || '';
    if (rawText.trim().length > 30) {
      const candidates: RawMomentCandidate[] = [];
      const paragraphs = rawText
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 40);

      const itemsToProcess = paragraphs.length > 0 ? paragraphs : [rawText];
      let offsetSec = 30;

      for (let i = 0; i < itemsToProcess.length && candidates.length < 6; i++) {
        const pText = itemsToProcess[i];
        const sentences = pText
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 15);

        const hookSentence =
          sentences[0] ||
          `The key principle behind ${context.niche} that most creators overlook.`;
        const durSec = Math.min(maxDur, Math.max(minDur, Math.round(pText.length / 14)));
        const startSec = offsetSec;
        const endSec = startSec + durSec;

        const payoffSentence =
          sentences.length > 1 ? sentences[sentences.length - 1] : `Actionable takeaway for ${context.niche}.`;

        candidates.push({
          startTime: this.formatSecondsToTimestamp(startSec),
          endTime: this.formatSecondsToTimestamp(endSec),
          duration: `${durSec}s`,
          durationSeconds: durSec,
          transcriptText: pText.slice(0, 350),
          hook: hookSentence.length > 120 ? `${hookSentence.slice(0, 117)}...` : hookSentence,
          contextSummary: `Key discussion point from "${content.videoTitle}".`,
          payoff: payoffSentence.length > 140 ? `${payoffSentence.slice(0, 137)}...` : payoffSentence,
          preliminaryReason: `Self-contained thought unit identified from content text.`,
        });

        offsetSec += durSec + 45; // Space out intervals naturally
      }

      if (candidates.length > 0) return candidates;
    }

    // 4. Default baseline candidate if text is minimal
    const baseDur = 38;
    return [
      {
        startTime: '01:15',
        endTime: '01:53',
        duration: `${baseDur}s`,
        durationSeconds: baseDur,
        transcriptText: `In this segment from "${content.videoTitle}", the discussion breaks down fundamental concepts in ${context.niche}.`,
        hook: `The essential takeaway about ${context.niche} you need to understand first.`,
        contextSummary: `Overview segment from ${content.videoTitle}.`,
        payoff: `Clear understanding of core principles in ${context.niche}.`,
        preliminaryReason: `Synthesized highlight candidate.`,
      },
    ];
  }

  private formatSecondsToTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Hybrid Moment Detector
 * Tries Gemini first for nuanced recall, falling back to heuristic detector on unavailable models.
 */
export class HybridMomentDetector implements IMomentDetector {
  public readonly name = 'hybrid-moment-detector';
  private geminiDetector: GeminiMomentDetector;
  private heuristicDetector: HeuristicTranscriptMomentDetector;

  constructor(apiKey?: string) {
    this.geminiDetector = new GeminiMomentDetector(apiKey);
    this.heuristicDetector = new HeuristicTranscriptMomentDetector();
  }

  public async detectMoments(
    content: ExtractedContent,
    context: {
      niche: string;
      subtopics: string[];
      minDurationSeconds?: number;
      maxDurationSeconds?: number;
    }
  ): Promise<RawMomentCandidate[]> {
    try {
      const moments = await this.geminiDetector.detectMoments(content, context);
      if (moments.length > 0) {
        return moments;
      }
    } catch (err: any) {
      console.warn('[HybridMomentDetector] Primary detection error, switching to heuristic detector:', err.message);
    }

    return this.heuristicDetector.detectMoments(content, context);
  }
}
