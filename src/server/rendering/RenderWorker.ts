import fs from 'fs';
import path from 'path';
import { db, DEFAULT_WORKSPACE_ID, storage } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { SourceMediaProvider } from './SourceMediaProvider';
import { SourceValidator } from './SourceValidator';
import { ClipRenderer } from './ClipRenderer';
import { SubtitleGenerator } from './SubtitleGenerator';
import { OutputValidator } from './OutputValidator';
import { StorageService } from './StorageService';
import { RenderJobService } from './RenderJobService';
import crypto from 'crypto';

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

  public async process(jobId: string, workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<boolean> {
    console.log(`[RenderWorker] Commencing async background render for job ID: ${jobId}`);
    let acquiredLocalPath: string | null = null;
    let subtitleAssPath: string | null = null;
    let renderedLocalPath: string | null = null;

    try {
      // 1. Fetch job row from Firestore
      const jobRef = doc(db, 'workspaces', workspaceId, 'jobs', jobId);
      const jobSnap = await getDoc(jobRef);
      const job = jobSnap.exists() ? jobSnap.data() : null;

      const metadata = job?.metadata || {};
      const candidateId = metadata.candidateId || (job?.targetTitle ? job.targetTitle.split(': ').pop()?.trim() : '');

      if (!candidateId) {
        throw new Error(`INVALID_JOB_METADATA: Missing candidateId.`);
      }

      // 2. Fetch candidate info
      const candRef = doc(db, 'workspaces', workspaceId, 'candidates', candidateId);
      const candSnap = await getDoc(candRef);

      if (!candSnap.exists()) {
        throw new Error(`CANDIDATE_NOT_FOUND: Could not load candidate details for ${candidateId}.`);
      }

      const candidate = candSnap.data();

      // 3. Transition: ACQUIRING MEDIA
      await this.jobService.transition(jobId, 'acquiring_media', 10, 'Acquiring source video streams...', undefined, workspaceId);

      let sourceVideo: any = null;
      if (candidate.sourceVideoId) {
        const srcRef = doc(db, 'workspaces', workspaceId, 'sources', candidate.sourceVideoId);
        const srcSnap = await getDoc(srcRef);
        if (srcSnap.exists()) {
          sourceVideo = srcSnap.data();
        }
      }

      if (!sourceVideo) {
        throw new Error(`SOURCE_VIDEO_NOT_FOUND: Could not read source video metadata.`);
      }

      const sourceInfo = await this.mediaProvider.acquire({
        id: sourceVideo.id,
        youtube_url: sourceVideo.youtubeUrl,
        mediaUrl: sourceVideo.mediaUrl || candidate.mediaUrl,
        mediaPath: sourceVideo.mediaPath || candidate.mediaPath,
        title: sourceVideo.title,
      });

      acquiredLocalPath = sourceInfo.localPath;

      // 4. Transition: VALIDATING SOURCE
      await this.jobService.transition(jobId, 'validating_source', 30, 'Validating downloaded source media...', undefined, workspaceId);

      const validation = await this.sourceValidator.validate(acquiredLocalPath);
      if (!validation.valid) {
        throw new Error(`SOURCE_VALIDATION_FAILED: ${validation.errorMessage || 'Invalid source file.'}`);
      }

      const startOffset = this.parseTimestampToSeconds(candidate.startTime || candidate.start_time);
      const endOffset = this.parseTimestampToSeconds(candidate.endTime || candidate.end_time);
      const candidateDuration = Math.max(5, endOffset - startOffset);

      // 5. Transition: RENDERING
      await this.jobService.transition(jobId, 'rendering', 50, 'Standardizing layout and generating subtitles...', undefined, workspaceId);

      const transcript = candidate.transcriptText || candidate.hook || '';
      if (transcript) {
        try {
          const subFiles = await this.subtitleGenerator.generate(transcript, candidateDuration);
          subtitleAssPath = subFiles.assFilePath;
        } catch (subErr: any) {
          console.warn(`[RenderWorker] Subtitle generation warning:`, subErr.message);
        }
      }

      const outDir = path.resolve(process.cwd(), 'temp_media', 'rendered');
      const clipId = 'clip_' + crypto.randomUUID().slice(0, 8) + '_' + Date.now();
      renderedLocalPath = path.join(outDir, `${clipId}.mp4`);

      await this.clipRenderer.render({
        sourcePath: acquiredLocalPath,
        startTime: candidate.startTime || candidate.start_time,
        duration: candidateDuration,
        subtitlePath: subtitleAssPath || undefined,
        outputPath: renderedLocalPath,
        hasAudio: validation.hasAudio,
      });

      // 6. Transition: VALIDATING OUTPUT
      await this.jobService.transition(jobId, 'validating_output', 80, 'Verifying render constraints and format...', undefined, workspaceId);

      const outputValidation = await this.outputValidator.validate(renderedLocalPath, candidateDuration);
      if (!outputValidation.valid) {
        throw new Error(`OUTPUT_VALIDATION_FAILED: ${outputValidation.errorMessage || 'Invalid output MP4 file.'}`);
      }

      // 7. Transition: UPLOADING TO STORAGE & FIRESTORE
      await this.jobService.transition(jobId, 'uploading', 90, 'Uploading clip record and media to Firebase Storage...', undefined, workspaceId);

      // Upload to Firebase Storage
      let publicVideoUrl = `/api/media/clips/${clipId}.mp4`;
      try {
        const fileBuffer = fs.readFileSync(renderedLocalPath);
        const storageRef = ref(storage, `workspaces/${workspaceId}/clips/${clipId}/video.mp4`);
        await uploadBytes(storageRef, fileBuffer, { contentType: 'video/mp4' });
        publicVideoUrl = await getDownloadURL(storageRef);
      } catch (storageErr: any) {
        console.warn('[RenderWorker] Firebase Storage upload notice, falling back to local stream URL:', storageErr);
      }

      const now = new Date().toISOString();
      const clipDocRef = doc(db, 'workspaces', workspaceId, 'clips', clipId);

      await setDoc(clipDocRef, {
        id: clipId,
        workspaceId,
        candidateId,
        title: `Vertical Clip: ${candidate.sourceTitle || 'Discovered Video'}`,
        hook: candidate.hook,
        sourceTitle: candidate.sourceTitle,
        channelTitle: candidate.channelTitle,
        duration: `${candidateDuration}s`,
        aspectRatio: '9:16',
        style: 'kinetic',
        status: 'ready',
        videoUrl: publicVideoUrl,
        thumbnailBg: 'from-slate-900 via-indigo-950 to-slate-900',
        captionsSample: [candidate.hook, candidate.summary],
        hashtags: ['#shorts', '#viral'],
        progress: 100,
        inQueue: false,
        queueStatus: 'needs_review',
        createdAt: now,
        updatedAt: now,
      });

      await setDoc(candRef, { status: 'approved', updatedAt: now }, { merge: true });

      await this.jobService.transition(jobId, 'completed', 100, 'Clip fully rendered and verified successfully!', undefined, workspaceId);

      return true;

    } catch (err: any) {
      console.error(`[RenderWorker] Critical job processing failure:`, err);

      const errCode = err.message?.split(': ')[0] || 'RENDER_ENGINE_EXCEPTION';
      const errMsg = err.message?.split(': ').pop() || err.message || 'An unexpected error occurred.';

      await this.jobService.transition(jobId, 'failed', 0, 'Render job failed', {
        code: errCode,
        message: errMsg,
      }, workspaceId);

      return false;
    }
  }

  private parseTimestampToSeconds(ts: string): number {
    if (!ts) return 0;
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return Number(ts) || 0;
  }
}
