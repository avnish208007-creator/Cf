import fs from 'fs';
import path from 'path';
import { execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { resolveYtDlp, resolveFfprobe, verifyYouTubeRuntime } from './binaries';

const execFileAsync = promisify(execFile);

export interface DownloadedMediaInfo {
  localPath: string;
  sourceUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Downloads a real YouTube video using yt-dlp.
 * No fake fallbacks, no sample video substitution.
 */
export async function downloadYouTubeSource(
  youtubeUrl: string,
  outputDir: string,
  filePrefix: string,
  onProcessRegistered?: (proc: ChildProcess) => void
): Promise<DownloadedMediaInfo> {
  const runtimeStatus = verifyYouTubeRuntime();
  if (!runtimeStatus.ready || !runtimeStatus.jsRuntimeArg) {
    throw new Error(
      `[YOUTUBE_RUNTIME_NOT_READY] ${runtimeStatus.error || 'YouTube downloader runtime is not properly configured.'}`
    );
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const destPath = path.resolve(outputDir, `${filePrefix}_source.mp4`);
  const ytDlpExecutable = runtimeStatus.ytDlpPath || resolveYtDlp();

  console.log(
    `[YouTubeDownloader] Downloading source video from "${youtubeUrl}" to "${destPath}" using ${ytDlpExecutable}...`
  );

  const ytDlpArgs: string[] = [
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--no-playlist',
    '--merge-output-format', 'mp4',
    '--extractor-args', 'youtube:player_client=android,web,ios',
    '--js-runtimes', runtimeStatus.jsRuntimeArg,
  ];

  const cookiesEnv = process.env.YT_COOKIES || process.env.YOUTUBE_COOKIES;
  const cookieFileCandidates = [
    path.resolve(process.cwd(), 'bin', 'cookies.txt'),
    path.resolve(process.cwd(), 'cookies.txt'),
    path.resolve(process.cwd(), 'tmp', 'cookies.txt'),
  ];
  let cookiesPath: string | null = null;
  let tmpCookiesPath: string | null = null;

  if (cookiesEnv) {
    tmpCookiesPath = path.resolve(outputDir, `${filePrefix}_cookies.txt`);
    fs.writeFileSync(tmpCookiesPath, cookiesEnv, 'utf8');
    cookiesPath = tmpCookiesPath;
  } else {
    for (const cand of cookieFileCandidates) {
      if (fs.existsSync(cand) && fs.statSync(cand).size > 0) {
        cookiesPath = cand;
        break;
      }
    }
  }

  if (cookiesPath) {
    console.log(`[YouTubeDownloader] Using cookies configuration for yt-dlp.`);
    ytDlpArgs.push('--cookies', cookiesPath);
  }

  ytDlpArgs.push('-o', destPath, youtubeUrl);

  const binDir = path.resolve(process.cwd(), 'bin');
  const customEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH || ''}`,
  };

  let stderrOutput = '';
  try {
    await new Promise((resolve, reject) => {
      const child = execFile(ytDlpExecutable, ytDlpArgs, {
        timeout: 180000,
        env: customEnv,
      }, (error, stdout, stderr) => {
        const destExists = fs.existsSync(destPath) && fs.statSync(destPath).size > 1000;
        if (error && !destExists) {
          (error as any).stderr = stderr;
          reject(error);
        } else {
          resolve(stdout);
        }
      });

      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          stderrOutput += chunk.toString();
        });
      }

      if (onProcessRegistered && child) {
        onProcessRegistered(child);
      }
    });
  } catch (dlErr: any) {
    const rawStderr = dlErr?.stderr?.toString() || stderrOutput || '';
    const lines = rawStderr.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const errorLines = lines.filter((l: string) => l.includes('ERROR:') || l.includes('Sign in to confirm you’re not a bot'));
    const hasRealError = errorLines.length > 0 || rawStderr.includes('ERROR:');
    const destExists = fs.existsSync(destPath) && fs.statSync(destPath).size > 1000;

    if (destExists && !hasRealError) {
      console.warn('[YouTubeDownloader] yt-dlp completed with non-fatal warnings.');
    } else {
      const primaryError = errorLines.length > 0 
        ? errorLines.join('\n') 
        : (lines.length > 0 ? lines.join('\n') : (dlErr?.message || 'yt-dlp execution failed'));

      console.error('[YouTubeDownloader] Download error detected.');

      if (primaryError.includes('Sign in to confirm you’re not a bot') || primaryError.includes('bot detection')) {
        throw new Error(
          `[YOUTUBE_AUTH_REQUIRED] YouTube download blocked: Bot detection triggered by YouTube. Authentication cookies are required for this video. Export cookies to bin/cookies.txt or set the YT_COOKIES environment variable.`
        );
      }

      throw new Error(`YouTube download failed: ${primaryError}`);
    }
  } finally {
    if (tmpCookiesPath && fs.existsSync(tmpCookiesPath)) {
      try { fs.unlinkSync(tmpCookiesPath); } catch {}
    }
  }

  if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 1000) {
    throw new Error('Downloaded YouTube media file is missing, corrupted, or too small.');
  }

  // Probe with ffprobe - fail if ffprobe fails (no fake fallback)
  const ffprobeExecutable = resolveFfprobe();
  const { stdout } = await execFileAsync(ffprobeExecutable, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    destPath,
  ]);
  const probe = JSON.parse(stdout);
  if (!probe.format || !probe.format.duration) {
    throw new Error('Failed to read media duration using ffprobe.');
  }
  const durationSeconds = Math.round(parseFloat(probe.format.duration));
  const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
  if (!videoStream) {
    throw new Error('Failed to find video stream using ffprobe.');
  }
  const width = Number(videoStream.width) || 1280;
  const height = Number(videoStream.height) || 720;
  const sizeBytes = fs.statSync(destPath).size;

  return {
    localPath: destPath,
    sourceUrl: youtubeUrl,
    durationSeconds,
    width,
    height,
    sizeBytes,
  };
}
