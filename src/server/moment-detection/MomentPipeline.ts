import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import {
  ExtractedContent,
  MomentDetectionPipelineOptions,
  MomentDetectionSourceResult,
  ScoredMoment,
} from './types';
import { IContentExtractor, ModularContentExtractor } from './ContentExtractor';
import { IMomentDetector, HybridMomentDetector } from './MomentDetector';
import { IMomentScorer, MultiFactorMomentScorer } from './MomentScorer';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
    // 1. Fetch source video from Firestore
    const srcDocRef = doc(db, 'source_videos', sourceId);
    const srcSnap = await getDoc(srcDocRef);

    if (!srcSnap.exists()) {
      return {
        sourceId,
        videoTitle: 'Unknown Source',
        youtubeUrl: '',
        status: 'failed',
        contentStatus: 'content_unavailable',
        candidatesFound: 0,
        candidates: [],
        message: 'Source video record not found in Firebase.',
      };
    }

    const source = { id: srcSnap.id, ...srcSnap.data() } as any;

    // 2. Mark source as analyzing / processing
    await updateDoc(srcDocRef, { status: 'processing' });

    console.log(`[MomentPipeline] Analyzing source "${source.title}" (${source.youtube_url})...`);

    // 3. Extract content
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

    if (!extracted.hasContent) {
      const failureReason = extracted.reason || 'Content unavailable for analysis: No transcript or chapter outline available for this video.';
      console.log(`[MomentPipeline] Source "${source.title}" content unavailable.`);

      await updateDoc(srcDocRef, {
        status: 'analyzed',
        candidates_count: 0,
        summary: `${failureReason} · ${source.summary || ''}`,
      });

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
      await updateDoc(srcDocRef, {
        status: 'analyzed',
        candidates_count: 0,
        summary: `Analysis error: ${err.message || 'AI detection error'}. ${source.summary || ''}`,
      });

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

    if (rawMoments.length === 0) {
      const msg = 'Analyzed video content — no plausible short-form segments found in the dialogue.';
      console.log(`[MomentPipeline] ${msg} ("${source.title}")`);
      await updateDoc(srcDocRef, {
        status: 'analyzed',
        candidates_count: 0,
        summary: `${msg} ${source.summary || ''}`,
      });

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
    const existingCandQuery = query(
      collection(db, 'clip_candidates'),
      where('source_video_id', '==', sourceId)
    );
    const existingCandSnap = await getDocs(existingCandQuery);
    const existingTimeKeys = new Set(
      existingCandSnap.docs.map((d) => {
        const data = d.data();
        return `${data.start_time}_${data.end_time}`;
      })
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
        sourceYoutubeUrl: source.youtube_url,
      };

      const candidateDbStatus: 'new' | 'in_review' | 'generating' | 'approved' | 'rejected' =
        moment.selectionStatus === 'selected'
          ? 'approved'
          : moment.selectionStatus === 'rejected'
          ? 'rejected'
          : 'new';

      const newCandRef = doc(collection(db, 'clip_candidates'));
      const newCandId = newCandRef.id;
      const now = new Date().toISOString();

      await setDoc(newCandRef, {
        id: newCandId,
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
        created_at: now,
      });

      console.log(`[ClipFlow] MOMENT INSERT: ${sourceId} [${moment.candidate.startTime} -> ${moment.candidate.endTime}] score: ${moment.overallScore} - "${moment.candidate.hook}"`);
      existingTimeKeys.add(timeKey);
      savedCount++;
    }

    await updateDoc(srcDocRef, {
      status: 'analyzed',
      candidates_count: savedCount,
    });

    const breakdownMsg = `${savedCount} candidates found (${selectionCounts.selected} auto-selected, ${selectionCounts.candidate} potential, ${selectionCounts.rejected} downranked)`;

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
