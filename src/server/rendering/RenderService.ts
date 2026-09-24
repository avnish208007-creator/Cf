import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '../discovery/pipeline';
import {
  RenderRequest,
  RenderResult,
  RenderJobState,
} from './types';
import { IMediaProvider, CompliantMediaProvider } from './MediaProvider';
import { IClipTrimmer, TimestampClipTrimmer } from './ClipTrimmer';
import { IVerticalReframer, SmartVerticalReframer } from './VerticalReframer';
import { ISubtitleGenerator, TranscriptSubtitleGenerator } from './SubtitleGenerator';
import { IAudioProcessor, FFmpegAudioProcessor } from './AudioProcessor';
import { IVideoRenderer, FFmpegVideoRenderer } from './VideoRenderer';
import { inspectVideoFile, validateRealVideo } from './inspectVideo';

export class RenderService {
  private mediaProvider: IMediaProvider;
  private clipTrimmer: IClipTrimmer;
  private verticalReframer: IVerticalReframer;
  private subtitleGenerator: ISubtitleGenerator;
  private audioProcessor: IAudioProcessor;
  private videoRenderer: IVideoRenderer;
  private supabase: SupabaseClient | null;

  // In-memory job registry for real-time progress queries
  private static jobsMap: Map<string, RenderJobState> = new Map();

  constructor(
    mediaProvider?: IMediaProvider,
    clipTrimmer?: IClipTrimmer,
    verticalReframer?: IVerticalReframer,
    subtitleGenerator?: ISubtitleGenerator,
    audioProcessor?: IAudioProcessor,
    videoRenderer?: IVideoRenderer,
    supabaseClient?: SupabaseClient | null
  ) {
    this.mediaProvider = mediaProvider || new CompliantMediaProvider();
    this.clipTrimmer = clipTrimmer || new TimestampClipTrimmer();
    this.verticalReframer = verticalReframer || new SmartVerticalReframer(1080, 1920);
    this.subtitleGenerator = subtitleGenerator || new TranscriptSubtitleGenerator();
    this.audioProcessor = audioProcessor || new FFmpegAudioProcessor();
    this.videoRenderer = videoRenderer || new FFmpegVideoRenderer();
    this.supabase = supabaseClient !== undefined ? supabaseClient : getSupabaseServerClient();
  }

  public getJob(jobId: string): RenderJobState | undefined {
    return RenderService.jobsMap.get(jobId);
  }

  /**
   * Executes the full modular rendering pipeline with strict validations:
   * SELECTED CANDIDATE
   * → queued
   * → acquiring_media
   * → media_acquired
   * → validating_media
   * → rendering
   * → validating_output
   * → uploading
   * → completed / failed
   */
  public async renderCandidateToVerticalClip(request: RenderRequest): Promise<RenderResult> {
    const jobId = `job_rend_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const clipId = `clip_${request.candidateId.slice(0, 12)}_${Date.now()}`;

    console.log(`[Render] render started: candidate ${request.candidateId} in workspace ${request.workspaceId}`);

    // Stage: queued
    const jobState: RenderJobState = {
      id: jobId,
      workspaceId: request.workspaceId,
      candidateId: request.candidateId,
      status: 'queued',
      stage: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    RenderService.jobsMap.set(jobId, jobState);

    try {
      // 1. SOURCE LOOKUP (Fetch corresponding source_videos record from Supabase)
      let resolvedYoutubeUrl = request.sourceYoutubeUrl;
      let resolvedMediaUrl = request.mediaUrl;
      let resolvedMediaPath = request.mediaPath;
      let resolvedTitle = request.sourceTitle;
      let resolvedChannelTitle = request.channelTitle;

      if (this.supabase && request.sourceVideoId) {
        try {
          const { data: sourceDb, error: srcDbErr } = await this.supabase
            .from('source_videos')
            .select('*')
            .eq('id', request.sourceVideoId)
            .maybeSingle();

          if (sourceDb && !srcDbErr) {
            resolvedYoutubeUrl = resolvedYoutubeUrl || sourceDb.youtube_url || sourceDb.source_url;
            resolvedMediaUrl = resolvedMediaUrl || sourceDb.media_url;
            resolvedMediaPath = resolvedMediaPath || sourceDb.media_path;
            resolvedTitle = resolvedTitle || sourceDb.title;
            resolvedChannelTitle = resolvedChannelTitle || sourceDb.channel_title;
          }
        } catch (srcLookupErr: any) {
          console.warn(`[Render] Source lookup warning for ${request.sourceVideoId}:`, srcLookupErr?.message);
        }
      }

      // 2. PARSE TIMESTAMPS
      const trim = this.clipTrimmer.validateAndParse(
        request.startTime,
        request.endTime,
        request.durationSeconds
      );

      // Stage: acquiring_media
      jobState.status = 'acquiring_media';
      jobState.stage = 'Acquiring source media...';
      jobState.updatedAt = new Date().toISOString();

      // 3. SOURCE MEDIA ACQUISITION
      const media = await this.mediaProvider.acquire({
        id: request.sourceVideoId || request.candidateId,
        youtubeUrl: resolvedYoutubeUrl,
        title: resolvedTitle,
        mediaUrl: resolvedMediaUrl,
        mediaPath: resolvedMediaPath,
      });

      if (!media.success || !media.mediaPath || !fs.existsSync(media.mediaPath)) {
        const errorReason = media.errorMessage || 'Source media is unavailable / unauthorized / unsupported';
        const failMsg = `MEDIA_ACQUISITION_FAILED\n\nThe selected source could not provide usable source media in the current runtime environment.\nNo clip was generated.\n\nProvider: ${this.mediaProvider.name}\nReason: ${errorReason}`;
        
        console.log(`[Render] render failed: ${failMsg}`);

        jobState.status = 'failed';
        jobState.stage = failMsg;
        jobState.errorCode = 'MEDIA_ACQUISITION_FAILED';
        jobState.errorMessage = failMsg;
        jobState.updatedAt = new Date().toISOString();

        // Update candidate with failed status
        if (this.supabase && request.candidateId.length === 36) {
          try {
            const { data: currentCand } = await this.supabase
              .from('clip_candidates')
              .select('factors')
              .eq('id', request.candidateId)
              .maybeSingle();

            const existingFactors = (currentCand?.factors || {}) as any;
            await this.supabase
              .from('clip_candidates')
              .update({
                factors: {
                  ...existingFactors,
                  renderStatus: 'failed',
                  mediaStatus: 'failed',
                  mediaErrorCode: 'MEDIA_ACQUISITION_FAILED',
                  mediaErrorMessage: errorReason,
                },
              })
              .eq('id', request.candidateId);
          } catch (_) {}
        }

        return {
          success: false,
          clipId,
          jobId,
          status: 'failed',
          durationSeconds: trim.durationSec,
          durationFormatted: trim.durationFormatted,
          aspectRatio: '9:16',
          width: 1080,
          height: 1920,
          errorCode: 'MEDIA_ACQUISITION_FAILED',
          errorMessage: failMsg,
        };
      }

      // Stage: media_acquired
      jobState.status = 'media_acquired';
      jobState.stage = 'Media acquired successfully';
      jobState.updatedAt = new Date().toISOString();

      // Stage: validating_media
      jobState.status = 'validating_media';
      jobState.stage = 'Validating acquired source media...';
      jobState.updatedAt = new Date().toISOString();

      // 4. REAL MEDIA INPUT VALIDATION
      const validation = validateRealVideo(media.mediaPath);
      if (!validation.valid || !validation.inspection) {
        const validationError = validation.reason || 'Input media validation failed.';
        let errorCode = 'SOURCE_MEDIA_INVALID';
        if (validationError.includes('SOURCE_MEDIA_STATIC')) {
          errorCode = 'SOURCE_MEDIA_STATIC';
        }
        const failMsg = `${errorCode}: ${validationError}`;
        console.error(`[Render] ${failMsg}`);

        jobState.status = 'failed';
        jobState.stage = failMsg;
        jobState.errorCode = errorCode;
        jobState.errorMessage = failMsg;
        jobState.updatedAt = new Date().toISOString();

        // NO clip generated, fail honestly
        return {
          success: false,
          clipId,
          jobId,
          status: 'failed',
          durationSeconds: 0,
          durationFormatted: '00:00',
          aspectRatio: '9:16',
          width: 1080,
          height: 1920,
          errorCode: errorCode,
          errorMessage: failMsg,
        };
      }

      const inputInspection = validation.inspection;
      let effectiveStartSec = trim.startSec;
      let effectiveDurationSec = trim.durationSec;

      if (inputInspection.durationSeconds && inputInspection.durationSeconds > 0) {
        if (effectiveStartSec >= inputInspection.durationSeconds) {
          effectiveStartSec = 0;
        }
        if (effectiveStartSec + effectiveDurationSec > inputInspection.durationSeconds) {
          effectiveDurationSec = Math.max(3, Math.floor(inputInspection.durationSeconds - effectiveStartSec));
        }
      }

      // Stage: rendering
      jobState.status = 'rendering';
      jobState.stage = 'Rendering vertical 9:16 MP4...';
      jobState.updatedAt = new Date().toISOString();

      // 5. 9:16 REFRAME & AUDIO PREPARATION
      const reframe = this.verticalReframer.buildReframeFilter({
        mode: request.reframeMode || 'centered_crop',
        targetWidth: 1080,
        targetHeight: 1920,
      });

      const audioFilterResult = this.audioProcessor.buildAudioFilter({
        normalize: true,
        targetIntegratedLoudness: -16,
        targetTruePeak: -1.5,
      });

      // 6. EXECUTE FFMPEG RENDER
      const rendered = await this.videoRenderer.renderClip({
        inputMediaFilePath: media.mediaPath,
        startSec: effectiveStartSec,
        durationSec: effectiveDurationSec,
        reframeFilter: reframe.videoFilter,
        subtitleAssPath: undefined, // Subtitles/captions explicitly disabled
        audioFilter: audioFilterResult.audioFilter,
        hasAudioStream: inputInspection.hasAudioStream,
        branding: request.branding,
        targetWidth: reframe.width,
        targetHeight: reframe.height,
        clipId,
      });

      // Stage: validating_output
      jobState.status = 'validating_output';
      jobState.stage = 'Validating render output...';
      jobState.updatedAt = new Date().toISOString();

      // 7. REAL OUTPUT VERIFICATION (Strict validation check)
      const outputValidation = validateRealVideo(rendered.outputMp4Path);
      if (!outputValidation.valid || !outputValidation.inspection) {
        const outError = outputValidation.reason || 'Render output verification failed.';
        const failMsg = `RENDER_OUTPUT_INVALID: ${outError}`;
        console.error(`[Render] ${failMsg}`);

        jobState.status = 'failed';
        jobState.stage = failMsg;
        jobState.errorCode = 'RENDER_OUTPUT_INVALID';
        jobState.errorMessage = failMsg;
        jobState.updatedAt = new Date().toISOString();

        return {
          success: false,
          clipId,
          jobId,
          status: 'failed',
          durationSeconds: 0,
          durationFormatted: '00:00',
          aspectRatio: '9:16',
          width: 1080,
          height: 1920,
          errorCode: 'RENDER_OUTPUT_INVALID',
          errorMessage: failMsg,
        };
      }

      const outputInspection = outputValidation.inspection;

      // Stage: uploading
      jobState.status = 'uploading';
      jobState.stage = 'Uploading vertical clip to storage...';
      jobState.updatedAt = new Date().toISOString();

      // 8. UPLOAD TO STORAGE & PERSIST TO DB
      const videoFilename = path.basename(rendered.outputMp4Path);
      const thumbFilename = path.basename(rendered.thumbnailJpgPath);

      let finalVideoUrl = `/api/media/clips/${videoFilename}`;
      let finalThumbUrl = `/api/media/clips/${thumbFilename}`;
      let storageBucket = 'clips';
      let storageObjectPath = `${request.workspaceId}/${videoFilename}`;

      if (this.supabase) {
        try {
          await this.supabase.storage.createBucket('clips', { public: true }).catch(() => {});

          const mp4Buffer = fs.readFileSync(rendered.outputMp4Path);
          const { error: mp4UploadError } = await this.supabase.storage
            .from(storageBucket)
            .upload(storageObjectPath, mp4Buffer, {
              contentType: 'video/mp4',
              upsert: true,
            });

          if (mp4UploadError) {
            throw new Error(`STORAGE_UPLOAD_FAILED: Video upload to Supabase Storage failed: ${mp4UploadError.message}`);
          }

          // Fetch public URL
          const { data: pubVideoData } = this.supabase.storage
            .from(storageBucket)
            .getPublicUrl(storageObjectPath);
          if (pubVideoData?.publicUrl) {
            finalVideoUrl = pubVideoData.publicUrl;
          }

          // 9. VERIFY UPLOADED FILE == RENDERED FILE (SHA-256 HASH VERIFICATION)
          console.log('[Render] Verifying uploaded video file integrity...');
          const localSha256 = crypto.createHash('sha256').update(mp4Buffer).digest('hex');

          // Download the uploaded Supabase object
          const { data: downloadBlob, error: downloadError } = await this.supabase.storage
            .from(storageBucket)
            .download(storageObjectPath);

          if (downloadError || !downloadBlob) {
            throw new Error(`STORAGE_UPLOAD_FAILED: Failed to download uploaded video object for validation: ${downloadError?.message || 'Empty response'}`);
          }

          const arrayBuffer = await downloadBlob.arrayBuffer();
          const downloadedBuffer = Buffer.from(arrayBuffer);

          if (downloadedBuffer.length === 0) {
            throw new Error('STORAGE_UPLOAD_FAILED: Downloaded storage object content is empty.');
          }

          const uploadedSha256 = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');

          if (localSha256 !== uploadedSha256) {
            throw new Error(`OUTPUT_UPLOAD_MISMATCH: SHA-256 hash mismatch! Local: ${localSha256}, Stored: ${uploadedSha256}`);
          }

          console.log('[Render] SHA-256 integrity check passed. Verifying actual content of uploaded file...');

          // Save downloaded bytes to a temp file and run full real video validation
          const downloadedTempPath = rendered.outputMp4Path + '.downloaded.mp4';
          fs.writeFileSync(downloadedTempPath, downloadedBuffer);

          try {
            const finalObjectValidation = validateRealVideo(downloadedTempPath);
            if (!finalObjectValidation.valid) {
              const reason = finalObjectValidation.reason || 'Invalid media content';
              if (reason.includes('SOURCE_MEDIA_STATIC')) {
                throw new Error(`OUTPUT_MEDIA_STATIC: The uploaded video is detected as a static thumbnail/image-only loop.`);
              } else {
                throw new Error(`OUTPUT_MEDIA_INVALID: The uploaded video format or container is invalid: ${reason}`);
              }
            }
            console.log('[Render] Uploaded video file validation complete. Motion and codec criteria verified.');
          } finally {
            try { fs.unlinkSync(downloadedTempPath); } catch (_) {}
          }

          const thumbStoragePath = `${request.workspaceId}/${thumbFilename}`;
          if (fs.existsSync(rendered.thumbnailJpgPath)) {
            const thumbBuffer = fs.readFileSync(rendered.thumbnailJpgPath);
            const { error: thumbUploadError } = await this.supabase.storage
              .from(storageBucket)
              .upload(thumbStoragePath, thumbBuffer, {
                contentType: 'image/jpeg',
                upsert: true,
              });
            if (!thumbUploadError) {
              const { data: pubThumbData } = this.supabase.storage
                .from(storageBucket)
                .getPublicUrl(thumbStoragePath);
              if (pubThumbData?.publicUrl) {
                finalThumbUrl = pubThumbData.publicUrl;
              }
            }
          }
        } catch (storageErr: any) {
          console.error('[Render] Storage / verification exception:', storageErr?.message);
          throw storageErr; // Propagate down to fail pipeline honestly
        }
      }

      if (this.supabase) {
        try {
          // Check if table contains video_url column dynamically to prevent crashes on non-migrated instances
          let hasVideoUrlColumn = false;
          try {
            const { error: colErr } = await this.supabase.from('clips').select('video_url').limit(1);
            hasVideoUrlColumn = !colErr || colErr.code !== '42703';
          } catch (_) {
            hasVideoUrlColumn = false;
          }

          const insertPayload: Record<string, any> = {
            workspace_id: request.workspaceId,
            candidate_id: request.candidateId.length === 36 ? request.candidateId : null,
            title: request.hook.split(':')[0] || request.hook.slice(0, 48),
            hook: request.hook,
            source_title: resolvedTitle || 'Discovered Source',
            channel_title: resolvedChannelTitle || 'Creator Channel',
            duration: trim.durationFormatted,
            aspect_ratio: '9:16',
            style: 'clean_mobile',
            status: 'ready',
            thumbnail_bg: finalThumbUrl,
            captions_sample: [request.hook, request.summary || 'Key highlights.'],
            hashtags: ['#shorts', '#vertical'],
            progress: 100,
          };

          if (hasVideoUrlColumn) {
            insertPayload.video_url = finalVideoUrl;
            insertPayload.scheduled_slot = null;
          } else {
            insertPayload.scheduled_slot = finalVideoUrl;
          }

          await this.supabase.from('clips').insert(insertPayload);

          if (request.candidateId.length === 36) {
            const { data: currentCand } = await this.supabase
              .from('clip_candidates')
              .select('factors')
              .eq('id', request.candidateId)
              .maybeSingle();

            const existingFactors = (currentCand?.factors || {}) as any;
            await this.supabase
              .from('clip_candidates')
              .update({
                status: 'rendered',
                factors: {
                  ...existingFactors,
                  renderStatus: 'completed',
                  outputUrl: finalVideoUrl,
                  thumbnailUrl: finalThumbUrl,
                  storageBucket,
                  storageObjectPath,
                  outputMime: outputInspection.mimeType,
                  outputSizeBytes: outputInspection.fileSizeBytes,
                  videoStreamDetected: outputInspection.hasVideoStream,
                  durationSeconds: outputInspection.durationSeconds,
                  frameCount: outputInspection.frameCount,
                  videoCodec: outputInspection.videoCodec,
                },
              })
              .eq('id', request.candidateId);
          }
        } catch (dbErr: any) {
          console.warn('[Render] Database insert warning:', dbErr?.message);
        }
      }

      // Stage: completed
      jobState.status = 'completed';
      jobState.stage = 'Render complete';
      jobState.outputUrl = finalVideoUrl;
      jobState.progress = 100;
      jobState.updatedAt = new Date().toISOString();

      return {
        success: true,
        clipId,
        jobId,
        status: 'completed',
        videoUrl: finalVideoUrl,
        thumbnailUrl: finalThumbUrl,
        outputFilePath: rendered.outputMp4Path,
        durationSeconds: trim.durationSec,
        durationFormatted: trim.durationFormatted,
        aspectRatio: '9:16',
        width: rendered.width,
        height: rendered.height,
        fileSizeBytes: rendered.fileSizeBytes,
      };
    } catch (err: any) {
      console.error('[Render] Pipeline exception:', err);
      
      let errorMsg = err.message || 'Rendering failed.';
      let errorCode = 'RENDER_FAILED';

      if (errorMsg.includes('MEDIA_ACQUISITION_FAILED')) errorCode = 'MEDIA_ACQUISITION_FAILED';
      else if (errorMsg.includes('SOURCE_MEDIA_INVALID')) errorCode = 'SOURCE_MEDIA_INVALID';
      else if (errorMsg.includes('SOURCE_MEDIA_STATIC')) errorCode = 'SOURCE_MEDIA_STATIC';
      else if (errorMsg.includes('STORAGE_UPLOAD_FAILED')) errorCode = 'STORAGE_UPLOAD_FAILED';
      else if (errorMsg.includes('OUTPUT_UPLOAD_MISMATCH')) errorCode = 'OUTPUT_UPLOAD_MISMATCH';
      else if (errorMsg.includes('OUTPUT_MEDIA_INVALID')) errorCode = 'OUTPUT_MEDIA_INVALID';
      else if (errorMsg.includes('OUTPUT_MEDIA_STATIC')) errorCode = 'OUTPUT_MEDIA_STATIC';

      jobState.status = 'failed';
      jobState.stage = errorMsg;
      jobState.errorCode = errorCode;
      jobState.errorMessage = errorMsg;
      jobState.updatedAt = new Date().toISOString();

      if (this.supabase && request.candidateId.length === 36) {
        try {
          const { data: currentCand } = await this.supabase
            .from('clip_candidates')
            .select('factors')
            .eq('id', request.candidateId)
            .maybeSingle();

          const existingFactors = (currentCand?.factors || {}) as any;
          await this.supabase
            .from('clip_candidates')
            .update({
              status: 'new', // Return to new state so it can be re-tried honestly
              factors: {
                ...existingFactors,
                renderStatus: 'failed',
                renderErrorCode: errorCode,
                renderErrorMessage: errorMsg,
              },
            })
            .eq('id', request.candidateId);
        } catch (_) {}
      }

      return {
        success: false,
        clipId,
        jobId,
        status: 'failed',
        durationSeconds: 0,
        durationFormatted: '00:00',
        aspectRatio: '9:16',
        width: 1080,
        height: 1920,
        errorCode,
        errorMessage: errorMsg,
      };
    }
  }
}
