import { spawn } from 'child_process';
import fs from 'fs';

export interface SourceValidationResult {
  valid: boolean;
  width: number;
  height: number;
  duration: number;
  fps: number;
  hasAudio: boolean;
  videoCodec: string;
  audioCodec: string;
  errorMessage?: string;
}

export class SourceValidator {
  /**
   * Inspects the actual acquired file using ffprobe to guarantee it is valid and real source footage.
   * Ensures moving frames exist and that there is a proper container, video stream, dimensions, fps and duration.
   */
  public async validate(filePath: string): Promise<SourceValidationResult> {
    console.log(`[SourceValidator] Conducting deep validation check on file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        width: 0,
        height: 0,
        duration: 0,
        fps: 0,
        hasAudio: false,
        videoCodec: 'none',
        audioCodec: 'none',
        errorMessage: 'Source file does not exist on disk.',
      };
    }

    const stats = fs.statSync(filePath);
    if (stats.size < 10000) {
      return {
        valid: false,
        width: 0,
        height: 0,
        duration: 0,
        fps: 0,
        hasAudio: false,
        videoCodec: 'none',
        audioCodec: 'none',
        errorMessage: `Source file is too small to be valid video (${stats.size} bytes).`,
      };
    }

    return new Promise((resolve) => {
      // Probe basic video details, stream count, codecs, duration, framerate and audio
      const ffprobeArgs = [
        '-v', 'error',
        '-show_entries', 'format=duration,size:stream=width,height,codec_name,codec_type,r_frame_rate',
        '-of', 'json',
        filePath
      ];

      const proc = spawn('ffprobe', ffprobeArgs);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          resolve({
            valid: false,
            width: 0,
            height: 0,
            duration: 0,
            fps: 0,
            hasAudio: false,
            videoCodec: 'none',
            audioCodec: 'none',
            errorMessage: `ffprobe error: ${stderr || 'Could not probe container.'}`,
          });
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          const format = parsed.format || {};
          const streams = parsed.streams || [];

          const videoStream = streams.find((s: any) => s.codec_type === 'video');
          const audioStream = streams.find((s: any) => s.codec_type === 'audio');

          if (!videoStream) {
            resolve({
              valid: false,
              width: 0,
              height: 0,
              duration: 0,
              fps: 0,
              hasAudio: false,
              videoCodec: 'none',
              audioCodec: 'none',
              errorMessage: 'Acquired file contains no valid video stream.',
            });
            return;
          }

          const width = Number(videoStream.width || 0);
          const height = Number(videoStream.height || 0);
          const duration = Number(format.duration || videoStream.duration || 0);

          // Parse framerate (e.g., "30/1" or "2997/100")
          let fps = 0;
          if (videoStream.r_frame_rate) {
            const [num, den] = videoStream.r_frame_rate.split('/');
            if (num && den) {
              fps = Number(num) / Number(den);
            } else {
              fps = Number(videoStream.r_frame_rate);
            }
          }

          if (width <= 0 || height <= 0 || duration <= 0 || isNaN(duration) || fps <= 0) {
            resolve({
              valid: false,
              width,
              height,
              duration,
              fps,
              hasAudio: !!audioStream,
              videoCodec: videoStream.codec_name || 'unknown',
              audioCodec: audioStream ? audioStream.codec_name : 'none',
              errorMessage: `Invalid dimensions, duration, or framerate detected. width=${width}, height=${height}, duration=${duration}, fps=${fps}`,
            });
            return;
          }

          // Frame decode validation
          console.log(`[SourceValidator] Checking for actual decodable moving frames on: ${filePath}`);
          const ffmpegArgs = [
            '-v', 'error',
            '-i', filePath,
            '-t', '1.0', // read first 1 second of frames
            '-f', 'null',
            '-'
          ];

          const decodeProc = spawn('ffmpeg', ffmpegArgs);
          let decodeStderr = '';
          decodeProc.stderr.on('data', (d) => { decodeStderr += d.toString(); });

          decodeProc.on('close', (decodeCode) => {
            if (decodeCode !== 0) {
              resolve({
                valid: false,
                width,
                height,
                duration,
                fps,
                hasAudio: !!audioStream,
                videoCodec: videoStream.codec_name || 'unknown',
                audioCodec: audioStream ? audioStream.codec_name : 'none',
                errorMessage: `Video stream contains undecodable frames: ${decodeStderr}`,
              });
            } else {
              resolve({
                valid: true,
                width,
                height,
                duration,
                fps,
                hasAudio: !!audioStream,
                videoCodec: videoStream.codec_name || 'unknown',
                audioCodec: audioStream ? audioStream.codec_name : 'none',
              });
            }
          });
        } catch (err: any) {
          resolve({
            valid: false,
            width: 0,
            height: 0,
            duration: 0,
            fps: 0,
            hasAudio: false,
            videoCodec: 'none',
            audioCodec: 'none',
            errorMessage: `Exception parsing ffprobe output: ${err.message}`,
          });
        }
      });
    });
  }
}
