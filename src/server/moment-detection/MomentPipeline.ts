import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '../discovery/pipeline';
import {
  ExtractedContent,
  MomentDetectionPipelineOptions,
  MomentDetectionSourceResult,
  ScoredMoment,
} from './types';
import { IContentExtractor, ModularContentExtractor } from './ContentExtractor';
import { IMomentDetector, HybridMomentDetector } from './MomentDetector';
import { IMomentScorer, MultiFactorMomentScorer } from './MomentScorer';

export class MomentPipeline {
  private contentExtractor: IContentExtractor;
  private momentDetector: IMomentDetector;
  private momentScorer: IMomentScorer;
  private supabase: SupabaseClient | null;

  constructor(
    contentExtractor?: IContentExtractor,
    momentDetector?: IMomentDetector,
    momentScorer?: IMomentScorer,
    supabaseClient?: SupabaseClient | null
  ) {
    this.contentExtractor = contentExtractor || new ModularContentExtractor();
    this.momentDetector = momentDetector || new HybridMomentDetector();
    this.momentScorer = momentScorer || new MultiFactorMomentScorer();
    this.supabase = supabaseClient !== undefined ? supabaseClient : getSupabaseServerClient();
  }

  /**
   * Analyzes one or more source videos, detects plausible moments,
   * calculates multi-factor retention scores & quality tiers, and persists to Supabase.
   */
  public async analyzeSources(
    sourceIds: string[],
    options: MomentDetectionPipelineOptions
  ): Promise<MomentDetectionSourceResult[]> {
    if (!this.supabase) {
      throw new Error('Supabase client unavailable. Please ensure database configuration is set.');
    }

    const results: MomentDetectionSourceResult[] = [];

    for (const sourceId of sourceIds) {
      const result = await this.analyzeSingleSource(sourceId, options);
      results.push(result);
    }

    return results;
  }

  public async analyzeSingleSource(
    sourceId: string,
    options: MomentDetectionPipelineOptions
  ): Promise<MomentDetectionSourceResult> {
    if (!this.supabase) {
      throw new Error('Supabase client unavailable.');
    }

    // 1. Fetch source video from Supabase
    const { data: source, error: srcError } = await this.supabase
      .from('source_videos')
      .select('*')
      .eq('id', sourceId)
      .maybeSingle();

    if (srcError || !source) {
      return {
        sourceId,
        videoTitle: 'Unknown Source',
        youtubeUrl: '',
        status: 'failed',
        contentStatus: 'content_unavailable',
        candidatesFound: 0,
        candidates: [],
        message: `Source video record not found: ${srcError?.message || 'Missing record'}`,
      };
    }

    // 2. Mark source as analyzing / processing
    await this.supabase
      .from('source_videos')
      .update({ status: 'processing' })
      .eq('id', sourceId);

    console.log(`[MomentPipeline] Analyzing source "${source.title}" (${source.youtube_url})...`);

    // 3. Extract content (prefers transcript, falls back to legitimate textual metadata)
    let extracted: ExtractedContent;
    try {
      extracted = await this.contentExtractor.extractContent({
        id: source.id,
        youtubeUrl: source.youtube_url,
        title: source.title,
        channelTitle: source.channel_title,
        description: source.summary || '',
        summary: source.summary || '',
      });
    } catch (err: any) {
      console.warn(`[MomentPipeline] Content extraction error for ${source.id}:`, err);
      extracted = {
        hasContent: false,
        contentType: 'none',
        videoId: source.id,
        videoTitle: source.title,
        channelTitle: source.channel_title,
        description: '',
        fullText: '',
        reason: `Content unavailable for analysis: ${err.message || 'Extraction failed'}`,
      };
    }

    // If content is unavailable, report honest state without fabricating moments
    if (!extracted.hasContent) {
      const failureReason = extracted.reason || 'Content unavailable for analysis: No transcript or chapter outline available for this video.';
      console.log(`[MomentPipeline] Source "${source.title}" content unavailable.`);

      await this.supabase
        .from('source_videos')
        .update({
          status: 'analyzed',
          candidates_count: 0,
          summary: `${failureReason} · ${source.summary || ''}`,
        })
        .eq('id', sourceId);

      return {
        sourceId,
        videoTitle: source.title,
        youtubeUrl: source.youtube_url,
        status: 'analyzed',
        contentStatus: 'content_unavailable',
        candidatesFound: 0,
        candidates: [],
        message: failureReason,
      };
    }

    // 4. Detect Candidate Moments (High Recall)
    console.log(
      `[MomentPipeline] Detecting candidate moments for "${source.title}" using format: ${extracted.contentType}...`
    );

    let rawMoments = [];
    try {
      rawMoments = await this.momentDetector.detectMoments(extracted, {
        niche: options.niche,
        subtopics: options.subtopics,
        minDurationSeconds: options.minDurationSeconds || 15,
        maxDurationSeconds: options.maxDurationSeconds || 75,
      });
    } catch (err: any) {
      console.error(`[MomentPipeline] Error during moment detection:`, err);
      await this.supabase
        .from('source_videos')
        .update({
          status: 'analyzed',
          candidates_count: 0,
          summary: `Analysis error: ${err.message || 'AI detection error'}. ${source.summary || ''}`,
        })
        .eq('id', sourceId);

      return {
        sourceId,
        videoTitle: source.title,
        youtubeUrl: source.youtube_url,
        status: 'failed',
        contentStatus: extracted.contentType === 'transcript' ? 'transcript_analyzed' : 'metadata_analyzed',
        candidatesFound: 0,
        candidates: [],
        message: `Moment detection error: ${err.message || 'Error processing model'}`,
      };
    }

    // If zero moments detected
    if (rawMoments.length === 0) {
      const msg = 'Analyzed video content — no plausible short-form segments found in the dialogue.';
      console.log(`[MomentPipeline] ${msg} ("${source.title}")`);
      await this.supabase
        .from('source_videos')
        .update({
          status: 'analyzed',
          candidates_count: 0,
          summary: `${msg} ${source.summary || ''}`,
        })
        .eq('id', sourceId);

      return {
        sourceId,
        videoTitle: source.title,
        youtubeUrl: source.youtube_url,
        status: 'analyzed',
        contentStatus: extracted.contentType === 'transcript' ? 'transcript_analyzed' : 'metadata_analyzed',
        candidatesFound: 0,
        candidates: [],
        message: msg,
      };
    }

    // 5. Timestamp validation & Multi-Factor Scoring
    // Validates: start_time >= 0, end_time > start_time, end_time <= source duration (when known)
    const sourceDurationSec = this.parseDurationToSeconds(source.duration);

    const validRawMoments = rawMoments.filter((m) => {
      const startSec = this.parseTimestampToSeconds(m.startTime);
      const endSec = this.parseTimestampToSeconds(m.endTime);

      if (startSec < 0) {
        console.warn(`[MomentPipeline] Rejecting candidate with negative start time: ${m.startTime}`);
        return false;
      }
      if (endSec <= startSec) {
        console.warn(`[MomentPipeline] Rejecting candidate where end time (${m.endTime}) <= start time (${m.startTime})`);
        return false;
      }
      if (sourceDurationSec > 0 && endSec > sourceDurationSec + 15) {
        console.warn(
          `[MomentPipeline] Rejecting candidate where end time (${endSec}s) exceeds source duration (${sourceDurationSec}s)`
        );
        return false;
      }
      return true;
    });

    // Score Candidates Independently with MultiFactorMomentScorer
    const scoredMoments: ScoredMoment[] = validRawMoments.map((m) =>
      this.momentScorer.scoreMoment(m, {
        niche: options.niche,
        subtopics: options.subtopics,
        videoTitle: source.title,
      })
    );

    // 6. Deduplicate Overlapping Moments, Rank by overall_score DESC, and Automatically Select Candidates
    const rankedMoments = this.momentScorer.deduplicateAndRank(scoredMoments, {
      minSelectionScore: options.minCandidateScore ?? 75,
    });

    console.log(
      `[MomentPipeline] Scored ${scoredMoments.length} moments → ${rankedMoments.length} after overlap deduplication and ranking.`
    );

    // Persist Candidates to Supabase
    const { data: existingCandidates } = await this.supabase
      .from('clip_candidates')
      .select('id, start_time, end_time')
      .eq('source_video_id', sourceId);

    const existingTimeKeys = new Set(
      (existingCandidates || []).map((ec) => `${ec.start_time}_${ec.end_time}`)
    );

    let savedCount = 0;
    const tierCounts = { Excellent: 0, Strong: 0, Potential: 0, Weak: 0 };
    const selectionCounts = { selected: 0, candidate: 0, rejected: 0 };

    for (const moment of rankedMoments) {
      tierCounts[moment.qualityTier]++;
      if (moment.selectionStatus) {
        selectionCounts[moment.selectionStatus]++;
      }

      const timeKey = `${moment.candidate.startTime}_${moment.candidate.endTime}`;
      if (existingTimeKeys.has(timeKey)) {
        savedCount++;
        continue;
      }

      const factorsPayload = {
        hookStrength: moment.hookScore,
        hookScore: moment.hookScore,
        standaloneContext: moment.contextScore,
        contextScore: moment.contextScore,
        pacing: moment.shortFormScore,
        curiosityScore: moment.curiosityScore,
        curiosity: moment.curiosityScore,
        payoffScore: moment.payoffScore,
        payoffStrength: moment.payoffScore,
        standaloneScore: moment.standaloneScore,
        standaloneClarity: moment.clarityScore,
        clarityScore: moment.clarityScore,
        shortFormScore: moment.shortFormScore,
        overallScore: moment.overallScore,
        qualityTier: moment.qualityTier,
        scoreReason: moment.scoreReason,
        rank: moment.rank,
        selectionStatus: moment.selectionStatus,
        selectionReason: moment.selectionReason,
        transcriptText: moment.candidate.transcriptText,
        hook: moment.candidate.hook,
        payoff: moment.candidate.payoff,
        contextSummary: moment.candidate.contextSummary,
        sourceYoutubeUrl: source.youtube_url,
      };

      // Ensure DB status strictly matches check constraint: ('new', 'in_review', 'generating', 'approved', 'rejected')
      const candidateDbStatus: 'new' | 'in_review' | 'generating' | 'approved' | 'rejected' =
        moment.selectionStatus === 'selected'
          ? 'approved'
          : moment.selectionStatus === 'rejected'
          ? 'rejected'
          : 'new';

      const { error: insertError } = await this.supabase
        .from('clip_candidates')
        .insert({
          workspace_id: options.workspaceId,
          source_video_id: sourceId,
          source_title: source.title,
          channel_title: source.channel_title,
          start_time: moment.candidate.startTime,
          end_time: moment.candidate.endTime,
          duration: moment.candidate.duration,
          hook: moment.candidate.hook,
          summary: `${moment.candidate.contextSummary} · Payoff: ${moment.candidate.payoff}`,
          score: moment.overallScore,
          factors: factorsPayload,
          status: candidateDbStatus,
        });

      if (insertError) {
        console.warn(`[MomentPipeline] Error saving candidate to Supabase:`, insertError.message);
      } else {
        console.log(`[ClipFlow] MOMENT INSERT: ${sourceId} [${moment.candidate.startTime} -> ${moment.candidate.endTime}] score: ${moment.overallScore} - "${moment.candidate.hook}"`);
        existingTimeKeys.add(timeKey);
        savedCount++;
      }
    }

    // 7. Update source video to 'analyzed' with candidates count
    await this.supabase
      .from('source_videos')
      .update({
        status: 'analyzed',
        candidates_count: savedCount,
      })
      .eq('id', sourceId);

    const breakdownMsg = `${savedCount} candidates found (${selectionCounts.selected} auto-selected, ${selectionCounts.candidate} potential, ${selectionCounts.rejected} downranked)`;
    console.log(`[MomentPipeline] Successfully analyzed "${source.title}": ${breakdownMsg}`);

    return {
      sourceId,
      videoTitle: source.title,
      youtubeUrl: source.youtube_url,
      status: 'analyzed',
      contentStatus: extracted.contentType === 'transcript' ? 'transcript_analyzed' : 'metadata_analyzed',
      candidatesFound: savedCount,
      candidates: scoredMoments,
      message: breakdownMsg,
    };
  }

  private parseTimestampToSeconds(timeStr: string): number {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':').map((p) => parseInt(p, 10));
    if (parts.some((p) => isNaN(p))) return 0;

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
  }

  private parseDurationToSeconds(durationStr: string): number {
    if (!durationStr) return 0;
    return this.parseTimestampToSeconds(durationStr);
  }
}
