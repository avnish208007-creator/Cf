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
import { inspectVideoFile, validateRealVideo, validateVisualMatch } from './inspectVideo';

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

  public async getJob(jobId: string): Promise<RenderJobState | undefined> {
    const memJob = RenderService.jobsMap.get(jobId);
    if (memJob) {
      return memJob;
    }
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('jobs')
          .select('*')
          .eq('id', jobId)
          .maybeSingle();

        if (data && !error) {
          let mappedStatus: RenderJobState['status'] = 'queued';
          if (data.status === 'completed') mappedStatus = 'completed';
          else if (data.status === 'failed') mappedStatus = 'failed';
          else if (data.status === 'running') {
            if (['queued', 'acquiring_media', 'media_acquired', 'validating_media', 'rendering', 'validating_output', 'uploading', 'persisting'].includes(data.stage)) {
              mappedStatus = data.stage as RenderJobState['status'];
            } else {
              mappedStatus = 'rendering';
            }
          }

          return {
            id: data.id,
            workspaceId: data.workspace_id,
            candidateId: data.target_title.replace('Render Clip: ', ''),
            status: mappedStatus,
            stage: data.stage,
            progress: data.progress,
            createdAt: data.started_at,
            updatedAt: data.completed_at || data.started_at,
          };
        }
      } catch (_) {}
    }
    return undefined;
  }

  private async updateJobState(
    jobState: RenderJobState,
    status: RenderJobState['status'],
    stage: string,
    progress?: number,
    extra: Partial<RenderJobState> = {}
  ) {
    jobState.status = status;
    jobState.stage = stage;
    if (progress !== undefined) {
      jobState.progress = progress;
    }
    Object.assign(jobState, extra);
    jobState.updatedAt = new Date().toISOString();
    RenderService.jobsMap.set(jobState.id, jobState);

    if (this.supabase) {
      try {
        const dbStatus =
          status === 'queued'
            ? 'queued'
            : status === 'completed'
            ? 'completed'
            : status === 'failed'
            ? 'failed'
            : 'running';

        const dbPayload: any = {
          id: jobState.id,
          workspace_id: jobState.workspaceId,
          type: 'vertical_render',
          target_title: `Render Clip: ${jobState.candidateId}`,
          progress: progress !== undefined ? Math.round(progress) : 0,
          stage: stage,
          status: dbStatus,
        };

        if (status === 'completed') {
          dbPayload.completed_at = new Date().toISOString();
        }

        const { error } = await this.supabase
          .from('jobs')
          .upsert(dbPayload, { onConflict: 'id' });

        if (error) {
          console.warn(`[RenderService] Failed to upsert job in DB: ${error.message}`);
        }
      } catch (dbErr: any) {
        console.warn(`[RenderService] Database error updating job:`, dbErr?.message);
      }
    }
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
    const jobId = request.jobId || `job_rend_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const clipId = `clip_${request.candidateId.slice(0, 12)}_${Date.now()}`;

    console.log(`[Render] render started: candidate ${request.candidateId} in workspace ${request.workspaceId}`);

    // Stage: queued
    const jobState: RenderJobState = {
      id: jobId,
      workspaceId: request.workspaceId,
      candidateId: request.candidateId,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    RenderService.jobsMap.set(jobId, jobState);
    await this.updateJobState(jobState, 'queued', 'queued', 0);

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
      await this.updateJobState(jobState, 'acquiring_media', 'acquiring_media', 10);

      // 3. SOURCE MEDIA ACQUISITION
      const media = await this.mediaProvider.acquire({
        id: request.sourceVideoId || request.candidateId,
        youtubeUrl: resolvedYoutubeUrl,
        title: resolvedTitle,
        mediaUrl: resolvedMediaUrl,
        mediaPath: resolvedMediaPath,
        isDevTest: request.isDevTest,
      });

      if (!media.success || !media.mediaPath || !fs.existsSync(media.mediaPath)) {
        const errorReason = media.errorMessage || 'Source media is unavailable / unauthorized / unsupported';
        const failMsg = `MEDIA_ACQUISITION_FAILED\n\nThe selected source could not provide usable source media in the current runtime environment.\nNo clip was generated.\n\nProvider: ${this.mediaProvider.name}\nReason: ${errorReason}`;
        
        console.log(`[Render] render failed: ${failMsg}`);

        await this.updateJobState(jobState, 'failed', failMsg, 10, {
          errorCode: 'MEDIA_ACQUISITION_FAILED',
          errorMessage: failMsg,
        });

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

      // 3.5. STRICT MEDIA PROVENANCE CONTRACT
      const isDevRender = request.isDevTest === true;
      const isDevMedia = media.mediaOrigin === 'DEVELOPMENT_TEST';
      if (!isDevRender && isDevMedia) {
        const errorReason = 'Security Contract Violation: DEVELOPMENT_TEST media origin is forbidden for normal production candidates.';
        const failMsg = `MEDIA_ACQUISITION_FAILED\n\nProvenance policy block:\n${errorReason}`;
        
        console.error(`[Render] render blocked by provenance policy: ${failMsg}`);

        await this.updateJobState(jobState, 'failed', failMsg, 10, {
          errorCode: 'MEDIA_ACQUISITION_FAILED',
          errorMessage: failMsg,
        });

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
      await this.updateJobState(jobState, 'media_acquired', 'media_acquired', 20);

      // Stage: validating_media
      await this.updateJobState(jobState, 'validating_media', 'validating_media', 25);

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

        await this.updateJobState(jobState, 'failed', failMsg, 25, {
          errorCode,
          errorMessage: failMsg,
        });

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
      
      console.log('--------------------------------------------');
      console.log('[PIPELINE LOG] SOURCE ACQUISITION METRICS:');
      console.log(`SOURCE URL: ${resolvedYoutubeUrl || resolvedMediaUrl || 'N/A'}`);
      console.log(`SOURCE PROVIDER: ${media.provider || 'Unknown'}`);
      console.log(`ACQUISITION PROVIDER: ${media.provider || 'Unknown'}`);
      console.log(`MEDIA PATH: ${media.mediaPath || 'N/A'}`);
      console.log(`MEDIA FILE SIZE: ${inputInspection.fileSizeBytes || 'Unknown'} bytes`);
      console.log(`MEDIA MIME TYPE: ${inputInspection.mimeType || 'video/mp4'}`);
      console.log(`VIDEO CODEC: ${inputInspection.videoCodec || 'Unknown'}`);
      console.log(`VIDEO DURATION: ${inputInspection.durationSeconds || 'Unknown'} seconds`);
      console.log(`VIDEO DIMENSIONS: ${inputInspection.width || 'Unknown'}x${inputInspection.height || 'Unknown'}`);
      console.log(`AUDIO CODEC: ${inputInspection.audioCodec || 'None'}`);
      console.log('--------------------------------------------');

      let effectiveStartSec = trim.startSec;
      let effectiveDurationSec = trim.durationSec;

      const isDevVideo = media.mediaOrigin === 'DEVELOPMENT_TEST';
      if (isDevVideo) {
        console.log('[Render] Development test video detected. Mapping requested interval to fit within the 15-second synthetic video.');
        effectiveStartSec = 2;
        effectiveDurationSec = 8;
      }

      if (inputInspection.durationSeconds && inputInspection.durationSeconds > 0) {
        if (effectiveDurationSec <= 0) {
          const errMsg = `SOURCE_TIMESTAMP_OUT_OF_RANGE: Requested clip duration is invalid or non-positive (${effectiveDurationSec}s).`;
          console.error(`[Render] ${errMsg}`);
          await this.updateJobState(jobState, 'failed', errMsg, 25, {
            errorCode: 'SOURCE_TIMESTAMP_OUT_OF_RANGE',
            errorMessage: errMsg,
          });
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
            errorCode: 'SOURCE_TIMESTAMP_OUT_OF_RANGE',
            errorMessage: errMsg,
          };
        }
        if (effectiveStartSec >= inputInspection.durationSeconds || effectiveStartSec < 0) {
          const errMsg = `SOURCE_TIMESTAMP_OUT_OF_RANGE: Requested start time (${effectiveStartSec}s) is out of range of the source video duration (${inputInspection.durationSeconds}s).`;
          console.error(`[Render] ${errMsg}`);
          await this.updateJobState(jobState, 'failed', errMsg, 25, {
            errorCode: 'SOURCE_TIMESTAMP_OUT_OF_RANGE',
            errorMessage: errMsg,
          });
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
            errorCode: 'SOURCE_TIMESTAMP_OUT_OF_RANGE',
            errorMessage: errMsg,
          };
        }
        if (effectiveStartSec + effectiveDurationSec > inputInspection.durationSeconds) {
          const errMsg = `SOURCE_TIMESTAMP_OUT_OF_RANGE: Requested clip interval ends at ${effectiveStartSec + effectiveDurationSec}s, exceeding the source video duration (${inputInspection.durationSeconds}s).`;
          console.error(`[Render] ${errMsg}`);
          await this.updateJobState(jobState, 'failed', errMsg, 25, {
            errorCode: 'SOURCE_TIMESTAMP_OUT_OF_RANGE',
            errorMessage: errMsg,
          });
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
            errorCode: 'SOURCE_TIMESTAMP_OUT_OF_RANGE',
            errorMessage: errMsg,
          };
        }
      }

      // Stage: rendering
      await this.updateJobState(jobState, 'rendering', 'rendering', 50);

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

      // 5.5. GENERATE SUBTITLES IF TRANSCRIPT/TEXT IS PROVIDED
      let subtitleAssPath: string | undefined = undefined;
      const subtitleText = request.hook || request.summary || 'ClipFlow';
      if (subtitleText && subtitleText.trim().length > 0) {
        try {
          console.log(`[Render] Generating synchronized subtitles for hook/transcript...`);
          const subFile = await this.subtitleGenerator.generateSubtitles(
            subtitleText,
            effectiveStartSec,
            effectiveDurationSec,
            { fontSize: 24, maxWordsPerLine: 6 }
          );
          subtitleAssPath = subFile.assFilePath;
          console.log(`[Render] Synchronized subtitles generated at: ${subtitleAssPath}`);
        } catch (subErr: any) {
          console.warn(`[Render] Subtitle generation failed, continuing without burned captions:`, subErr?.message);
        }
      }

      // 6. EXECUTE FFMPEG RENDER
      const rendered = await this.videoRenderer.renderClip({
        inputMediaFilePath: media.mediaPath,
        startSec: effectiveStartSec,
        durationSec: effectiveDurationSec,
        reframeFilter: reframe.videoFilter,
        subtitleAssPath: subtitleAssPath,
        audioFilter: audioFilterResult.audioFilter,
        hasAudioStream: inputInspection.hasAudioStream,
        branding: request.branding,
        targetWidth: reframe.width,
        targetHeight: reframe.height,
        clipId,
      });

      // Stage: validating_output
      await this.updateJobState(jobState, 'validating_output', 'validating_output', 75);

      // 7. REAL OUTPUT VERIFICATION (Strict validation check)
      const outputValidation = validateRealVideo(rendered.outputMp4Path);
      if (!outputValidation.valid || !outputValidation.inspection) {
        const outError = outputValidation.reason || 'Render output verification failed.';
        const failMsg = `RENDER_OUTPUT_INVALID: ${outError}`;
        console.error(`[Render] ${failMsg}`);

        await this.updateJobState(jobState, 'failed', failMsg, 75, {
          errorCode: 'RENDER_OUTPUT_INVALID',
          errorMessage: failMsg,
        });

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

      // 7.5. VISUAL CROSS-VALIDATION OF OUTPUT AGAINST SOURCE MEDIA
      console.log(`[Render] Performing visual cross-validation of output MP4 against source...`);
      const crossMatch = validateVisualMatch(media.mediaPath, effectiveStartSec, rendered.outputMp4Path);
      if (!crossMatch.matched) {
        const failMsg = crossMatch.reason || 'Visual cross-validation between source and rendered output failed.';
        console.error(`[Render] ${failMsg}`);

        await this.updateJobState(jobState, 'failed', failMsg, 75, {
          errorCode: 'OUTPUT_VISUAL_MISMATCH',
          errorMessage: failMsg,
        });

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
          errorCode: 'OUTPUT_VISUAL_MISMATCH',
          errorMessage: failMsg,
        };
      }

      console.log(`[Render] Visual cross-validation passed with correlation coefficient: ${crossMatch.correlation.toFixed(4)}`);
      const outputInspection = outputValidation.inspection;

      // Stage: uploading
      await this.updateJobState(jobState, 'uploading', 'uploading', 90);
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

      // Stage: persisting
      await this.updateJobState(jobState, 'persisting', 'persisting', 95);

      if (this.supabase) {
        try {
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
            video_url: finalVideoUrl,
            scheduled_slot: null,
          };

          const { error: insertErr } = await this.supabase.from('clips').insert(insertPayload);
          if (insertErr) {
            throw new Error(`DATABASE_PERSISTENCE_FAILED: Failed to insert rendered clip: ${insertErr.message}`);
          }

          if (request.candidateId.length === 36) {
            const { data: currentCand } = await this.supabase
              .from('clip_candidates')
              .select('factors')
              .eq('id', request.candidateId)
              .maybeSingle();

            const existingFactors = (currentCand?.factors || {}) as any;
            const { error: updateErr } = await this.supabase
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

            if (updateErr) {
              throw new Error(`DATABASE_PERSISTENCE_FAILED: Failed to update candidate status: ${updateErr.message}`);
            }
          }
        } catch (dbErr: any) {
          console.error('[Render] Database persistence failed:', dbErr?.message);
          throw dbErr;
        }
      }

      // Stage: completed
      await this.updateJobState(jobState, 'completed', 'completed', 100, {
        outputUrl: finalVideoUrl,
      });

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
      else if (errorMsg.includes('DATABASE_PERSISTENCE_FAILED')) errorCode = 'DATABASE_PERSISTENCE_FAILED';

      await this.updateJobState(jobState, 'failed', errorMsg, jobState.progress || 0, {
        errorCode,
        errorMessage: errorMsg,
      });

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
              status: 'failed', // Keep failed status so user sees error detail in UI
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
