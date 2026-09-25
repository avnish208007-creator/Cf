import fs from 'fs';
import path from 'path';
import { supabase } from '../../lib/supabase';
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

  public async process(jobId: string): Promise<boolean> {
    console.log(`[RenderWorker] Commencing async background render for job ID: ${jobId}`);
    let acquiredLocalPath: string | null = null;
    let subtitleAssPath: string | null = null;
    let renderedLocalPath: string | null = null;

    try {
      // 1. Fetch job row
      const { data: job } = await supabase
        .from('render_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      const workspaceId = job?.workspace_id || 'a0000000-0000-4000-a000-000000000001';
      const metadata = job?.metadata || {};
      const candidateId = metadata.candidateId || (job?.target_title ? job.target_title.split(': ').pop()?.trim() : '');

      if (!candidateId || !workspaceId) {
        throw new Error(`INVALID_JOB_METADATA: Missing candidateId or workspaceId.`);
      }

      // 2. Fetch candidate info
      const { data: candidate } = await supabase
        .from('clip_candidates')
        .select('*')
        .eq('id', candidateId)
        .maybeSingle();

      if (!candidate) {
        throw new Error(`CANDIDATE_NOT_FOUND: Could not load candidate details for ${candidateId}.`);
      }

      // 3. Transition: ACQUIRING MEDIA
      await this.jobService.transition(jobId, 'acquiring_media', 10, 'Acquiring source video streams...');

      let sourceVideo: any = null;
      if (candidate.source_video_id) {
        const { data: srcData } = await supabase
          .from('source_videos')
          .select('*')
          .eq('id', candidate.source_video_id)
          .maybeSingle();
        sourceVideo = srcData;
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
      await this.jobService.transition(jobId, 'validating_source', 30, 'Validating downloaded source media...');

      const validation = await this.sourceValidator.validate(acquiredLocalPath);
      if (!validation.valid) {
        throw new Error(`SOURCE_VALIDATION_FAILED: ${validation.errorMessage || 'Invalid source file.'}`);
      }

      const startOffset = this.parseTimestampToSeconds(candidate.start_time);
      const endOffset = this.parseTimestampToSeconds(candidate.end_time);
      const candidateDuration = Math.max(5, endOffset - startOffset);

      // 5. Transition: RENDERING
      await this.jobService.transition(jobId, 'rendering', 50, 'Standardizing layout, cropping landscape to vertical 9:16, and generating subtitles...');

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
        startTime: candidate.start_time,
        duration: candidateDuration,
        subtitlePath: subtitleAssPath || undefined,
        outputPath: renderedLocalPath,
        hasAudio: validation.hasAudio,
      });

      // 6. Transition: VALIDATING OUTPUT
      await this.jobService.transition(jobId, 'validating_output', 80, 'Verifying render constraints and format...');

      const outputValidation = await this.outputValidator.validate(renderedLocalPath, candidateDuration);
      if (!outputValidation.valid) {
        throw new Error(`OUTPUT_VALIDATION_FAILED: ${outputValidation.errorMessage || 'Invalid output MP4 file.'}`);
      }

      // 7. Transition: UPLOADING / SAVING CLIP
      await this.jobService.transition(jobId, 'uploading', 90, 'Uploading clip record...');

      const publicVideoUrl = await this.storageService.uploadAndVerify(renderedLocalPath, workspaceId, clipId);
      const now = new Date().toISOString();

      const { error: clipInsertErr } = await supabase.from('clips').insert({
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
        thumbnail_bg: 'from-slate-900 via-indigo-950 to-slate-900',
        captions_sample: [candidate.hook, candidate.summary],
        hashtags: ['#shorts', '#viral'],
        progress: 100,
        in_queue: false,
        queue_status: 'needs_review',
        created_at: now,
        updated_at: now,
      });

      if (clipInsertErr) {
        console.error(`[RenderWorker] Error inserting clip record into Supabase:`, clipInsertErr.message);
      }

      await supabase
        .from('clip_candidates')
        .update({ status: 'approved', updated_at: now })
        .eq('id', candidateId);

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
