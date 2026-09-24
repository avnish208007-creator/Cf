import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface ClipRendererInput {
  sourcePath: string;
  startTime: string; // "00:01:23" or "83"
  duration: number;   // e.g. 15
  subtitlePath?: string;
  outputPath: string;
  hasAudio: boolean;
}

export interface ClipRendererOutput {
  outputPath: string;
  duration: number;
  width: number;
  height: number;
  codec: string;
  audioCodec: string;
  size: number;
}

export class ClipRenderer {
  /**
   * Performs the actual horizontal-to-vertical video rendering, subtitle burning, and audio normalization.
   * ClipRenderer ONLY handles the ffmpeg invocation and has no dependencies on database or storage.
   */
  public async render(input: ClipRendererInput): Promise<ClipRendererOutput> {
    console.log(`[ClipRenderer] Initializing FFmpeg render loop for vertical H.264 clip:`);
    console.log(` - Source: ${input.sourcePath}`);
    console.log(` - Segment: Start ${input.startTime}, Duration ${input.duration}s`);
    console.log(` - Subtitles: ${input.subtitlePath || 'none'}`);
    console.log(` - Target Output: ${input.outputPath}`);

    if (!fs.existsSync(input.sourcePath)) {
      throw new Error(`SOURCE_FILE_NOT_FOUND: ${input.sourcePath}`);
    }

    // Ensure output directory exists
    const outDir = path.dirname(input.outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const ffmpegArgs: string[] = ['-y'];

      // 1. Fast seek input using candidate start timestamp
      ffmpegArgs.push('-ss', input.startTime);
      ffmpegArgs.push('-t', String(input.duration));
      ffmpegArgs.push('-i', input.sourcePath);

      // 2. Build vertical centering crop + subtitle filter
      let videoFilters = 'crop=ih*9/16:ih:(iw-ow)/2:0,scale=1080:1920';
      if (input.subtitlePath) {
        // Safe escaping for subtitle filter paths
        const escapedSubPath = input.subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
        videoFilters += `,subtitles='${escapedSubPath}'`;
      }

      ffmpegArgs.push('-vf', videoFilters);

      // 3. Audio mapping and normalization (only if source has audio)
      if (input.hasAudio) {
        ffmpegArgs.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
        ffmpegArgs.push('-c:a', 'aac');
        ffmpegArgs.push('-ar', '48000');
        ffmpegArgs.push('-ac', '2');
        ffmpegArgs.push('-b:a', '128k');
      } else {
        console.log(`[ClipRenderer] Source has no audio. Rendering silent vertical MP4.`);
      }

      // 4. Video encoding settings (conservative browser-compatible profile)
      ffmpegArgs.push('-c:v', 'libx264');
      ffmpegArgs.push('-preset', 'medium');
      ffmpegArgs.push('-crf', '22');
      ffmpegArgs.push('-pix_fmt', 'yuv420p');
      ffmpegArgs.push('-r', '30'); // Max 30 FPS standard
      ffmpegArgs.push('-movflags', '+faststart'); // Web playback optimization

      ffmpegArgs.push(input.outputPath);

      console.log(`[ClipRenderer] Running FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

      const proc = spawn('ffmpeg', ffmpegArgs);
      let stderr = '';
      
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg rendering failed with exit code ${code}. Stderr: ${stderr}`));
          return;
        }

        if (!fs.existsSync(input.outputPath) || fs.statSync(input.outputPath).size < 10000) {
          reject(new Error('FFmpeg completed but did not write a valid output video file.'));
          return;
        }

        // Retrieve properties of the rendered video file
        const stats = fs.statSync(input.outputPath);
        resolve({
          outputPath: input.outputPath,
          duration: input.duration,
          width: 1080,
          height: 1920,
          codec: 'h264',
          audioCodec: input.hasAudio ? 'aac' : 'none',
          size: stats.size
        });
      });
    });
  }
}
