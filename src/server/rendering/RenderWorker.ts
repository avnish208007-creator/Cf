import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import { SourceMediaProvider } from './SourceMediaProvider';
import { SourceValidator } from './SourceValidator';
import { ClipRenderer } from './ClipRenderer';
import { SubtitleGenerator } from './SubtitleGenerator';
import { OutputValidator } from './OutputValidator';
import { StorageService } from './StorageService';
import { RenderJobService } from './RenderJobService';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export class RenderWorker {
  private jobService: RenderJobService;
  private mediaProvider: SourceMediaProvider;
  private sourceValidator: SourceValidator;
  private clipRenderer: ClipRenderer;
  private subtitleGenerator: SubtitleGenerator;
  private outputValidator: OutputValidator;
  private storageService: StorageService;

  constructor() {
    this.jobService = new RenderJobService();
    this.mediaProvider = new SourceMediaProvider();
    this.sourceValidator = new SourceValidator();
    this.clipRenderer = new ClipRenderer();
    this.subtitleGenerator = new SubtitleGenerator();
    this.outputValidator = new OutputValidator();
    this.storageService = new StorageService();
  }

  public async process(jobId: string): Promise<boolean> {
    console.log(`[RenderWorker] Commencing async background render for job ID: ${jobId}`);
    let acquiredLocalPath: string | null = null;
    let subtitleAssPath: string | null = null;
    let subtitleSrtPath: string | null = null;
    let renderedLocalPath: string | null = null;

    try {
      // 1. Fetch job row
      const jobSnap = await getDoc(doc(db, 'render_jobs', jobId));
      if (!jobSnap.exists()) {
        throw new Error(`JOB_NOT_FOUND: Failed to read job row from Firebase.`);
      }

      const job = { id: jobSnap.id, ...jobSnap.data() } as any;
      const workspaceId = job.workspace_id;
      const metadata = job.metadata || {};
      const candidateId = metadata.candidateId || (job.target_title ? job.target_title.split(': ').pop()?.trim() : '');

      if (!candidateId || !workspaceId) {
        throw new Error(`INVALID_JOB_METADATA: Missing candidateId or workspaceId.`);
      }

      // 2. Fetch candidate info
      const candSnap = await getDoc(doc(db, 'clip_candidates', candidateId));
      if (!candSnap.exists()) {
        throw new Error(`CANDIDATE_NOT_FOUND: Could not load candidate details.`);
      }
      const candidate = { id: candSnap.id, ...candSnap.data() } as any;

      // 3. Transition: ACQUIRING MEDIA
      await this.jobService.transition(jobId, 'acquiring_media', 10, 'Acquiring legitimate source video streams...');

      let sourceVideo: any = null;
      if (candidate.source_video_id) {
        const srcSnap = await getDoc(doc(db, 'source_videos', candidate.source_video_id));
        if (srcSnap.exists()) {
          sourceVideo = { id: srcSnap.id, ...srcSnap.data() };
        }
      }

      if (!sourceVideo) {
        throw new Error(`SOURCE_VIDEO_NOT_FOUND: Could not read source video metadata.`);
      }

      const sourceInfo = await this.mediaProvider.acquire({
        id: sourceVideo.id,
        youtube_url: sourceVideo.youtube_url,
        mediaUrl: sourceVideo.media_url || candidate.mediaUrl,
        mediaPath: sourceVideo.media_path || candidate.mediaPath,
        title: sourceVideo.title,
      });

      acquiredLocalPath = sourceInfo.localPath;

      // 4. Transition: VALIDATING SOURCE
      await this.jobService.transition(jobId, 'validating_source', 30, 'Deeply validating downloaded source media...');

      const validation = await this.sourceValidator.validate(acquiredLocalPath);
      if (!validation.valid) {
        throw new Error(`SOURCE_VALIDATION_FAILED: ${validation.errorMessage || 'Invalid source file.'}`);
      }

      const startOffset = this.parseTimestampToSeconds(candidate.start_time);
      const endOffset = this.parseTimestampToSeconds(candidate.end_time);
      const candidateDuration = endOffset - startOffset;

      if (startOffset < 0 || candidateDuration <= 0 || (startOffset + candidateDuration) > (validation.duration + 2.0)) {
        throw new Error(`INVALID_CANDIDATE_TIMESTAMP: Requested crop boundaries (${candidate.start_time} to ${candidate.end_time}) are invalid for source duration of ${validation.duration}s`);
      }

      // 5. Transition: RENDERING
      await this.jobService.transition(jobId, 'rendering', 50, 'Standardizing layout, cropping landscape to vertical 9:16, and burning subtitles...');

      const transcript = candidate.transcriptText || candidate.hook || '';
      if (transcript) {
        try {
          const subFiles = await this.subtitleGenerator.generate(transcript, candidateDuration);
          subtitleAssPath = subFiles.assFilePath;
          subtitleSrtPath = subFiles.srtFilePath;
        } catch (subErr: any) {
          console.warn(`[RenderWorker] Subtitle generation warning:`, subErr.message);
        }
      }

      const outDir = path.resolve(process.cwd(), 'temp_media', 'rendered');
      const clipId = 'clip_' + Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6);
      renderedLocalPath = path.join(outDir, `${clipId}.mp4`);

      await this.clipRenderer.render({
        sourcePath: acquiredLocalPath,
        startTime: candidate.start_time,
        duration: candidateDuration,
        subtitlePath: subtitleAssPath || undefined,
        outputPath: renderedLocalPath,
        hasAudio: validation.hasAudio,
      });

      // 6. Transition: VALIDATING OUTPUT
      await this.jobService.transition(jobId, 'validating_output', 80, 'Verifying render constraints, profiles, formats, and motion...');

      const outputValidation = await this.outputValidator.validate(renderedLocalPath, candidateDuration);
      if (!outputValidation.valid) {
        throw new Error(`OUTPUT_VALIDATION_FAILED: ${outputValidation.errorMessage || 'Invalid output MP4 file.'}`);
      }

      // 7. Transition: UPLOADING
      await this.jobService.transition(jobId, 'uploading', 90, 'Uploading clip record...');

      const publicVideoUrl = await this.storageService.uploadAndVerify(renderedLocalPath, workspaceId, clipId);
      const now = new Date().toISOString();

      await setDoc(doc(db, 'clips', clipId), {
        id: clipId,
        workspace_id: workspaceId,
        candidate_id: candidateId,
        title: `Vertical Clip: ${candidate.source_title || candidate.sourceTitle || 'Discovered Video'}`,
        hook: candidate.hook,
        source_title: candidate.source_title || candidate.sourceTitle,
        channel_title: candidate.channel_title || candidate.channelTitle,
        duration: candidate.duration || `${candidateDuration}s`,
        aspect_ratio: '9:16',
        style: 'kinetic',
        status: 'ready',
        video_url: publicVideoUrl,
        created_at: now,
      });

      await updateDoc(doc(db, 'clip_candidates', candidateId), { status: 'approved' });

      await this.jobService.transition(jobId, 'completed', 100, 'Clip fully rendered and verified successfully!');

      return true;

    } catch (err: any) {
      console.error(`[RenderWorker] Critical job processing failure:`, err);

      const errCode = err.message?.split(': ')[0] || 'RENDER_ENGINE_EXCEPTION';
      const errMsg = err.message?.split(': ').pop() || err.message || 'An unexpected error occurred.';

      await this.jobService.transition(jobId, 'failed', 0, 'Render job failed', {
        code: errCode,
        message: errMsg,
      });

      return false;
    }
  }

  private parseTimestampToSeconds(ts: string): number {
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return Number(ts) || 0;
  }
}
