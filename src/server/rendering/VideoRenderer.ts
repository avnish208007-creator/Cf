import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { BrandingConfig } from './types';

export interface RenderPipelineOptions {
  inputMediaFilePath: string;
  startSec: number;
  durationSec: number;
  reframeFilter: string;
  subtitleAssPath?: string;
  audioFilter?: string;
  hasAudioStream?: boolean;
  branding?: BrandingConfig;
  targetWidth?: number;
  targetHeight?: number;
  outputDir?: string;
  clipId?: string;
}

export interface RenderedVideoOutput {
  outputMp4Path: string;
  thumbnailJpgPath: string;
  fileSizeBytes: number;
  width: number;
  height: number;
}

export interface IVideoRenderer {
  renderClip(options: RenderPipelineOptions): Promise<RenderedVideoOutput>;
}

export class FFmpegVideoRenderer implements IVideoRenderer {
  private outputDir: string;

  constructor(customOutputDir?: string) {
    this.outputDir = customOutputDir || path.resolve(process.cwd(), 'uploads', 'rendered');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  public async renderClip(options: RenderPipelineOptions): Promise<RenderedVideoOutput> {
    const id = options.clipId || `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const outputMp4Path = path.join(this.outputDir, `${id}.mp4`);
    const thumbnailJpgPath = path.join(this.outputDir, `${id}.jpg`);

    // Verify input file exists
    if (!fs.existsSync(options.inputMediaFilePath)) {
      throw new Error(`Source media file not found at: ${options.inputMediaFilePath}`);
    }

    const width = options.targetWidth || 1080;
    const height = options.targetHeight || 1920;

    // Build base video filter: Reframe + Subtitles + Watermark
    let combinedVideoFilter = options.reframeFilter;
    let subtitleFilterAdded = false;

    if (options.subtitleAssPath && fs.existsSync(options.subtitleAssPath)) {
      const escapedPath = options.subtitleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      combinedVideoFilter += `,subtitles='${escapedPath}'`;
      subtitleFilterAdded = true;
    }

    if (options.branding?.enabled && options.branding.brandName) {
      const safeBrandText = options.branding.brandName.replace(/'/g, '').slice(0, 24);
      combinedVideoFilter += `,drawtext=text='${safeBrandText}':fontcolor=white@0.65:fontsize=24:x=w-tw-48:y=64:box=1:boxcolor=black@0.35:boxborderw=8`;
    }

    const hasAudio = options.hasAudioStream !== false;
    const hasBranding = !!(options.branding?.enabled && options.branding.brandName);

    // Helper to construct FFmpeg argument list with branding toggle
    const buildArgs = (includeSubtitles: boolean, includeAudioFilter: boolean, includeBranding: boolean): string[] => {
      let vf = options.reframeFilter;
      if (includeSubtitles && options.subtitleAssPath && fs.existsSync(options.subtitleAssPath)) {
        const escapedPath = options.subtitleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        vf += `,subtitles='${escapedPath}'`;
      }
      if (includeBranding && options.branding?.enabled && options.branding.brandName) {
        const safeBrandText = options.branding.brandName.replace(/'/g, '').slice(0, 24);
        vf += `,drawtext=text='${safeBrandText}':fontcolor=white@0.65:fontsize=24:x=w-tw-48:y=64:box=1:boxcolor=black@0.35:boxborderw=8`;
      }

      const argsList: string[] = [
        '-y',
        '-ss',
        options.startSec.toString(),
        '-t',
        options.durationSec.toString(),
        '-i',
        options.inputMediaFilePath,
      ];

      if (!hasAudio) {
        // Input has no audio stream, mix in silent audio track
        argsList.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
      }

      argsList.push('-vf', vf);

      if (hasAudio && includeAudioFilter) {
        argsList.push('-af', options.audioFilter || 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none');
      }

      argsList.push(
        '-c:v',
        'libx264',
        '-profile:v',
        'main',
        '-level',
        '3.1',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '30',
        '-g',
        '60',
        '-keyint_min',
        '60',
        '-preset',
        'medium',
        '-crf',
        '20',
        '-b:v',
        '4000k',
        '-maxrate',
        '6000k',
        '-bufsize',
        '8000k',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        outputMp4Path
      );

      return argsList;
    };

    let args = buildArgs(subtitleFilterAdded, true, hasBranding);
    console.log(`[FFmpegVideoRenderer] Rendering clip ${id}: ffmpeg ${args.join(' ')}`);

    try {
      await this.executeFFmpeg(args);
    } catch (primaryErr: any) {
      console.warn(`[FFmpegVideoRenderer] Primary render attempt failed (${primaryErr?.message}). Retrying fallback configurations...`);

      const fallbacks = [
        // Attempt 2: with subtitles, without audio filter, with branding
        { sub: subtitleFilterAdded, audio: false, brand: hasBranding },
        // Attempt 3: with subtitles, with audio filter, WITHOUT branding (in case drawtext is missing)
        { sub: subtitleFilterAdded, audio: true, brand: false },
        // Attempt 4: with subtitles, WITHOUT audio filter, WITHOUT branding
        { sub: subtitleFilterAdded, audio: false, brand: false },
        // Attempt 5: WITHOUT subtitles (in case subtitle filter errors), with audio filter, with branding
        { sub: false, audio: true, brand: hasBranding },
        // Attempt 6: WITHOUT subtitles, WITHOUT branding, with audio filter
        { sub: false, audio: true, brand: false },
        // Attempt 7: WITHOUT subtitles, WITHOUT branding, WITHOUT audio filter (absolute basic crop rendering)
        { sub: false, audio: false, brand: false },
      ];

      let success = false;
      for (const f of fallbacks) {
        try {
          console.log(`[FFmpegVideoRenderer] Trying fallback: subtitles=${f.sub}, audioFilter=${f.audio}, branding=${f.brand}`);
          args = buildArgs(f.sub, f.audio, f.brand);
          await this.executeFFmpeg(args);
          success = true;
          break;
        } catch (fErr: any) {
          console.warn(`[FFmpegVideoRenderer] Fallback attempt failed: ${fErr?.message}`);
        }
      }

      if (!success) {
        throw primaryErr;
      }
    }

    // Verify output file
    if (!fs.existsSync(outputMp4Path)) {
      throw new Error(`Rendering failed: output file was not generated at ${outputMp4Path}`);
    }

    const stats = fs.statSync(outputMp4Path);
    if (stats.size < 1000) {
      // Remove broken 262-byte empty container header file if left behind
      if (fs.existsSync(outputMp4Path)) {
        try { fs.unlinkSync(outputMp4Path); } catch (_) {}
      }
      throw new Error(`Rendering failed: output file is empty (${stats.size} bytes).`);
    }

    // Generate poster thumbnail at midpoint
    try {
      const thumbMidSec = Math.max(0.5, options.durationSec / 2);
      const thumbArgs = [
        '-y',
        '-ss',
        thumbMidSec.toString(),
        '-i',
        outputMp4Path,
        '-vframes',
        '1',
        '-q:v',
        '3',
        thumbnailJpgPath,
      ];
      await this.executeFFmpeg(thumbArgs);
    } catch (thumbErr) {
      console.warn('[FFmpegVideoRenderer] Thumbnail generation warning:', thumbErr);
    }

    return {
      outputMp4Path,
      thumbnailJpgPath,
      fileSizeBytes: stats.size,
      width,
      height,
    };
  }

  private executeFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let stderrOutput = '';

      proc.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          console.error('[FFmpegVideoRenderer] FFmpeg failed with code:', code, stderrOutput.slice(-500));
          reject(new Error(`FFmpeg rendering process exited with code ${code}: ${stderrOutput.slice(-300)}`));
        }
      });

      proc.on('error', (err) => {
        console.error('[FFmpegVideoRenderer] Process error:', err);
        reject(err);
      });
    });
  }
}
