import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  ExtractedContent,
  MomentDetectionPipelineOptions,
  MomentDetectionSourceResult,
  ScoredMoment,
} from './types';
import { IContentExtractor, ModularContentExtractor } from './ContentExtractor';
import { IMomentDetector, HybridMomentDetector } from './MomentDetector';
import { IMomentScorer, MultiFactorMomentScorer } from './MomentScorer';
import crypto from 'crypto';

export class MomentPipeline {
  private contentExtractor: IContentExtractor;
  private momentDetector: IMomentDetector;
  private momentScorer: IMomentScorer;

  constructor(
    contentExtractor?: IContentExtractor,
    momentDetector?: IMomentDetector,
    momentScorer?: IMomentScorer
  ) {
    this.contentExtractor = contentExtractor || new ModularContentExtractor();
    this.momentDetector = momentDetector || new HybridMomentDetector();
    this.momentScorer = momentScorer || new MultiFactorMomentScorer();
  }

  public async analyzeSources(
    sourceIds: string[],
    options: MomentDetectionPipelineOptions
  ): Promise<MomentDetectionSourceResult[]> {
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
    const workspaceId = options.workspaceId || DEFAULT_WORKSPACE_ID;

    // 1. Fetch source video from Firestore
    const sourceRef = doc(db, 'workspaces', workspaceId, 'sources', sourceId);
    const sourceSnap = await getDoc(sourceRef);

    if (!sourceSnap.exists()) {
      return {
        sourceId,
        videoTitle: 'Unknown Source',
        youtubeUrl: '',
        status: 'failed',
        contentStatus: 'content_unavailable',
        candidatesFound: 0,
        candidates: [],
        message: 'Source video record not found in Firestore.',
      };
    }

    const source = sourceSnap.data();

    // 2. Mark source as processing
    await setDoc(sourceRef, { status: 'processing', updatedAt: new Date().toISOString() }, { merge: true });

    console.log(`[MomentPipeline] Analyzing source "${source.title}" (${source.youtubeUrl})...`);

    // 3. Extract content
    let extracted: ExtractedContent;
    try {
      extracted = await this.contentExtractor.extractContent({
        id: sourceId,
        youtubeUrl: source.youtubeUrl,
        title: source.title,
        channelTitle: source.channelTitle,
        description: source.summary || '',
        summary: source.summary || '',
      });
    } catch (err: any) {
      console.warn(`[MomentPipeline] Content extraction error for ${sourceId}:`, err);
      extracted = {
        hasContent: false,
        contentType: 'none',
        videoId: sourceId,
        videoTitle: source.title,
        channelTitle: source.channelTitle,
        description: '',
        fullText: '',
        reason: `Content unavailable for analysis: ${err.message || 'Extraction failed'}`,
      };
    }

    if (!extracted.hasContent) {
      const failureReason = extracted.reason || 'Content unavailable for analysis: No transcript or chapter outline available for this video.';
      console.log(`[MomentPipeline] Source "${source.title}" content unavailable.`);

      await setDoc(sourceRef, {
        status: 'analyzed',
        candidatesCount: 0,
        summary: `${failureReason} · ${source.summary || ''}`,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return {
        sourceId,
        videoTitle: source.title,
        youtubeUrl: source.youtubeUrl,
        status: 'analyzed',
        contentStatus: 'content_unavailable',
        candidatesFound: 0,
        candidates: [],
        message: failureReason,
      };
    }

    // 4. Detect Candidate Moments
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
      await setDoc(sourceRef, {
        status: 'analyzed',
        candidatesCount: 0,
        summary: `Analysis error: ${err.message || 'AI detection error'}. ${source.summary || ''}`,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return {
        sourceId,
        videoTitle: source.title,
        youtubeUrl: source.youtubeUrl,
        status: 'failed',
        contentStatus: extracted.contentType === 'transcript' ? 'transcript_analyzed' : 'metadata_analyzed',
        candidatesFound: 0,
        candidates: [],
        message: `Moment detection error: ${err.message || 'Error processing model'}`,
      };
    }

    if (rawMoments.length === 0) {
      const msg = 'Analyzed video content — no plausible short-form segments found in the dialogue.';
      console.log(`[MomentPipeline] ${msg} ("${source.title}")`);
      await setDoc(sourceRef, {
        status: 'analyzed',
        candidatesCount: 0,
        summary: `${msg} ${source.summary || ''}`,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return {
        sourceId,
        videoTitle: source.title,
        youtubeUrl: source.youtubeUrl,
        status: 'analyzed',
        contentStatus: extracted.contentType === 'transcript' ? 'transcript_analyzed' : 'metadata_analyzed',
        candidatesFound: 0,
        candidates: [],
        message: msg,
      };
    }

    // 5. Timestamp validation & Multi-Factor Scoring
    const sourceDurationSec = this.parseDurationToSeconds(source.duration);

    const validRawMoments = rawMoments.filter((m) => {
      const startSec = this.parseTimestampToSeconds(m.startTime);
      const endSec = this.parseTimestampToSeconds(m.endTime);

      if (startSec < 0) return false;
      if (endSec <= startSec) return false;
      if (sourceDurationSec > 0 && endSec > sourceDurationSec + 15) return false;
      return true;
    });

    const scoredMoments: ScoredMoment[] = validRawMoments.map((m) =>
      this.momentScorer.scoreMoment(m, {
        niche: options.niche,
        subtopics: options.subtopics,
        videoTitle: source.title,
      })
    );

    const rankedMoments = this.momentScorer.deduplicateAndRank(scoredMoments, {
      minSelectionScore: options.minCandidateScore ?? 75,
    });

    // Check existing candidates in Firestore
    const candsRef = collection(db, 'workspaces', workspaceId, 'candidates');
    const candsSnap = await getDocs(candsRef);
    const existingCands = candsSnap.docs
      .map((d) => d.data())
      .filter((c) => c.sourceVideoId === sourceId);

    const existingTimeKeys = new Set(
      existingCands.map((d) => `${d.startTime}_${d.endTime}`)
    );

    let savedCount = 0;
    const selectionCounts = { selected: 0, candidate: 0, rejected: 0 };

    for (const moment of rankedMoments) {
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
        sourceYoutubeUrl: source.youtubeUrl,
      };

      const candidateDbStatus: 'new' | 'in_review' | 'generating' | 'approved' | 'rejected' =
        moment.selectionStatus === 'selected'
          ? 'approved'
          : moment.selectionStatus === 'rejected'
          ? 'rejected'
          : 'new';

      const newCandId = crypto.randomUUID();
      const now = new Date().toISOString();

      const candDocRef = doc(db, 'workspaces', workspaceId, 'candidates', newCandId);
      await setDoc(candDocRef, {
        id: newCandId,
        workspaceId,
        sourceVideoId: sourceId,
        sourceTitle: source.title,
        channelTitle: source.channelTitle,
        startTime: moment.candidate.startTime,
        endTime: moment.candidate.endTime,
        duration: moment.candidate.duration,
        hook: moment.candidate.hook,
        summary: `${moment.candidate.contextSummary} · Payoff: ${moment.candidate.payoff}`,
        score: moment.overallScore,
        factors: factorsPayload,
        status: candidateDbStatus,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`[ClipFlow] MOMENT INSERT: ${sourceId} [${moment.candidate.startTime} -> ${moment.candidate.endTime}] score: ${moment.overallScore} - "${moment.candidate.hook}"`);
      existingTimeKeys.add(timeKey);
      savedCount++;
    }

    await setDoc(sourceRef, {
      status: 'analyzed',
      candidatesCount: savedCount,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    const breakdownMsg = `${savedCount} candidates found (${selectionCounts.selected} auto-selected, ${selectionCounts.candidate} potential, ${selectionCounts.rejected} downranked)`;

    return {
      sourceId,
      videoTitle: source.title,
      youtubeUrl: source.youtubeUrl,
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
