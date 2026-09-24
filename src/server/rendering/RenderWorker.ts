import fs from 'fs';
import path from 'path';
import { SupabaseClient } from '@supabase/supabase-js';
import { SourceMediaProvider } from './SourceMediaProvider';
import { SourceValidator } from './SourceValidator';
import { ClipRenderer } from './ClipRenderer';
import { SubtitleGenerator } from './SubtitleGenerator';
import { OutputValidator } from './OutputValidator';
import { StorageService } from './StorageService';
import { RenderJobService } from './RenderJobService';

export class RenderWorker {
  private supabase: SupabaseClient;
  private jobService: RenderJobService;
  private mediaProvider: SourceMediaProvider;
  private sourceValidator: SourceValidator;
  private clipRenderer: ClipRenderer;
  private subtitleGenerator: SubtitleGenerator;
  private outputValidator: OutputValidator;
  private storageService: StorageService;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.jobService = new RenderJobService(supabase);
    this.mediaProvider = new SourceMediaProvider();
    this.sourceValidator = new SourceValidator();
    this.clipRenderer = new ClipRenderer();
    this.subtitleGenerator = new SubtitleGenerator();
    this.outputValidator = new OutputValidator();
    this.storageService = new StorageService(supabase);
  }

  /**
   * Safe entrypoint to process an asynchronous vertical rendering job.
   */
  public async process(jobId: string): Promise<boolean> {
    console.log(`[RenderWorker] Commencing async background render for job ID: ${jobId}`);
    let acquiredLocalPath: string | null = null;
    let subtitleAssPath: string | null = null;
    let subtitleSrtPath: string | null = null;
    let renderedLocalPath: string | null = null;

    try {
      // 1. Fetch job row
      const { data: job, error: jobErr } = await this.supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      if (jobErr || !job) {
        throw new Error(`JOB_NOT_FOUND: Failed to read job row from Supabase.`);
      }

      // Extract details
      const workspaceId = job.workspace_id;
      // Extract metadata or candidateId
      const metadata = job.metadata || {};
      const candidateId = metadata.candidateId || job.target_title.split(': ').pop()?.trim();

      if (!candidateId || !workspaceId) {
        throw new Error(`INVALID_JOB_METADATA: Missing candidateId or workspaceId.`);
      }

      // 2. Fetch candidate info
      const { data: candidate, error: candErr } = await this.supabase
        .from('clip_candidates')
        .select('*')
        .eq('id', candidateId)
        .maybeSingle();

      if (candErr || !candidate) {
        throw new Error(`CANDIDATE_NOT_FOUND: Could not load candidate details.`);
      }

      // 3. Transition: ACQUIRING MEDIA
      await this.jobService.transition(jobId, 'acquiring_media', 10, 'Acquiring legitimate source video streams...');

      // Fetch corresponding source_video
      const { data: sourceVideo, error: sourceErr } = await this.supabase
        .from('source_videos')
        .select('*')
        .eq('id', candidate.source_video_id)
        .maybeSingle();

      if (sourceErr || !sourceVideo) {
        throw new Error(`SOURCE_VIDEO_NOT_FOUND: Could not read source video metadata.`);
      }

      // Execute legitimate source acquisition (No fallbacks!)
      const sourceInfo = await this.mediaProvider.acquire({
        id: sourceVideo.id,
        youtube_url: sourceVideo.youtube_url,
        mediaUrl: sourceVideo.media_url || candidate.mediaUrl,
        mediaPath: sourceVideo.media_path || candidate.mediaPath,
        title: sourceVideo.title
      });

      acquiredLocalPath = sourceInfo.localPath;

      // 4. Transition: VALIDATING SOURCE
      await this.jobService.transition(jobId, 'validating_source', 30, 'Deeply validating downloaded source media...');

      const validation = await this.sourceValidator.validate(acquiredLocalPath);
      if (!validation.valid) {
        throw new Error(`SOURCE_VALIDATION_FAILED: ${validation.errorMessage || 'Invalid source file.'}`);
      }

      // Parse timestamps
      const startOffset = this.parseTimestampToSeconds(candidate.start_time);
      const endOffset = this.parseTimestampToSeconds(candidate.end_time);
      const candidateDuration = endOffset - startOffset;

      if (startOffset < 0 || candidateDuration <= 0 || (startOffset + candidateDuration) > (validation.duration + 2.0)) {
        throw new Error(`INVALID_CANDIDATE_TIMESTAMP: Requested crop boundaries (${candidate.start_time} to ${candidate.end_time}) are invalid for source duration of ${validation.duration}s`);
      }

      // 5. Transition: RENDERING
      await this.jobService.transition(jobId, 'rendering', 50, 'Standardizing layout, cropping landscape to vertical 9:16, and burning subtitles...');

      // Generate subtitles ASS file if transcript exists
      const transcript = candidate.transcriptText || candidate.hook || '';
      if (transcript) {
        try {
          const subFiles = await this.subtitleGenerator.generate(transcript, candidateDuration);
          subtitleAssPath = subFiles.assFilePath;
          subtitleSrtPath = subFiles.srtFilePath;
        } catch (subErr: any) {
          console.warn(`[RenderWorker] Subtitle generation warning (will proceed without subtitles):`, subErr.message);
        }
      }

      // Define target local render path
      const outDir = path.resolve(process.cwd(), 'temp_media', 'rendered');
      const clipId = 'clip_' + Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6);
      renderedLocalPath = path.join(outDir, `${clipId}.mp4`);

      // Run H.264 rendering loop
      await this.clipRenderer.render({
        sourcePath: acquiredLocalPath,
        startTime: candidate.start_time,
        duration: candidateDuration,
        subtitlePath: subtitleAssPath || undefined,
        outputPath: renderedLocalPath,
        hasAudio: validation.hasAudio
      });

      // 6. Transition: VALIDATING OUTPUT
      await this.jobService.transition(jobId, 'validating_output', 80, 'Verifying render constraints, profiles, formats, and motion...');

      const outputValidation = await this.outputValidator.validate(renderedLocalPath, candidateDuration);
      if (!outputValidation.valid) {
        throw new Error(`OUTPUT_VALIDATION_FAILED: ${outputValidation.errorMessage || 'Invalid output MP4 file.'}`);
      }

      // 7. Transition: UPLOADING
      await this.jobService.transition(jobId, 'uploading', 90, 'Uploading to secure Supabase storage with double SHA-256 verification...');

      const publicVideoUrl = await this.storageService.uploadAndVerify(renderedLocalPath, workspaceId, clipId);

      // Create clip row in Supabase clips table
      const { error: clipErr } = await this.supabase
        .from('clips')
        .insert({
          id: clipId,
          workspace_id: workspaceId,
          candidate_id: candidateId,
          title: `Vertical Clip: ${candidate.sourceTitle || 'Discovered Video'}`,
          hook: candidate.hook,
          source_title: candidate.sourceTitle,
          channel_title: candidate.channelTitle,
          duration: candidate.duration || `${candidateDuration}s`,
          aspect_ratio: '9:16',
          style: 'kinetic',
          status: 'ready',
          video_url: publicVideoUrl,
        });

      if (clipErr) {
        throw new Error(`CLIPS_DB_INSERTION_FAILED: ${clipErr.message}`);
      }

      // Update candidate status to approved
      await this.supabase
        .from('clip_candidates')
        .update({ status: 'approved' })
        .eq('id', candidateId);

      // Complete job!
      await this.jobService.transition(jobId, 'completed', 100, 'Clip fully rendered, verified, and uploaded successfully!');

      // Perform cleanup to prevent local storage leaks
      this.cleanupTempFiles([acquiredLocalPath, subtitleAssPath, subtitleSrtPath, renderedLocalPath]);
      return true;

    } catch (err: any) {
      console.error(`[RenderWorker] Critical job processing failure:`, err);

      const errCode = err.message?.split(': ')[0] || 'RENDER_ENGINE_EXCEPTION';
      const errMsg = err.message?.split(': ').pop() || err.message || 'An unexpected error occurred.';

      await this.jobService.transition(jobId, 'failed', 0, 'Render job failed', {
        code: errCode,
        message: errMsg
      });

      // Update candidate status to failed so UI unlocks
      try {
        const metadata = (await this.supabase.from('jobs').select('metadata').eq('id', jobId).maybeSingle()).data?.metadata || {};
        const candidateId = metadata.candidateId;
        if (candidateId) {
          await this.supabase
            .from('clip_candidates')
            .update({ status: 'new' })
            .eq('id', candidateId);
        }
      } catch (_) {}

      this.cleanupTempFiles([acquiredLocalPath, subtitleAssPath, subtitleSrtPath, renderedLocalPath]);
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

  private cleanupTempFiles(filePaths: (string | null)[]) {
    for (const file of filePaths) {
      if (file && fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
          console.log(`[RenderWorker] Cleaned up temporary file: ${file}`);
        } catch (err: any) {
          console.warn(`[RenderWorker] Failed to clean up ${file}:`, err.message);
        }
      }
    }
  }
}
