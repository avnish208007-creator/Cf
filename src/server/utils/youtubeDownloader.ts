import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
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
  filePrefix: string
): Promise<DownloadedMediaInfo> {
  // 1. Verify YouTube execution environment and JS runtime
  const runtimeStatus = verifyYouTubeRuntime();
  if (!runtimeStatus.ready) {
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
    '--extractor-args', 'youtube:player_client=ios,android,web',
  ];

  // Utilize runtime diagnostics for deno and python via --js-runtime / --js-runtimes
  if (runtimeStatus.denoPath) {
    ytDlpArgs.push('--js-runtime', `deno:${runtimeStatus.denoPath}`);
    ytDlpArgs.push('--js-runtimes', `deno:${runtimeStatus.denoPath}`);
  }
  if (runtimeStatus.jsRuntimeArg && !runtimeStatus.denoPath) {
    ytDlpArgs.push('--js-runtime', runtimeStatus.jsRuntimeArg);
    ytDlpArgs.push('--js-runtimes', runtimeStatus.jsRuntimeArg);
  }

  const cookiesEnv = process.env.YT_COOKIES;
  const cookiesFile = path.resolve(process.cwd(), 'bin', 'cookies.txt');
  let cookiesPath: string | null = null;
  let tmpCookiesPath: string | null = null;

  if (cookiesEnv) {
    tmpCookiesPath = path.resolve(outputDir, `${filePrefix}_cookies.txt`);
    fs.writeFileSync(tmpCookiesPath, cookiesEnv, 'utf8');
    cookiesPath = tmpCookiesPath;
  } else if (fs.existsSync(cookiesFile)) {
    cookiesPath = cookiesFile;
  }

  if (cookiesPath) {
    ytDlpArgs.push('--cookies', cookiesPath);
  }

  ytDlpArgs.push('-o', destPath, youtubeUrl);

  const binDir = path.resolve(process.cwd(), 'bin');
  const pythonBinDir = runtimeStatus.pythonPath ? path.dirname(runtimeStatus.pythonPath) : '';
  const customEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${pythonBinDir ? pythonBinDir + ':' : ''}${process.env.PATH || ''}`,
    PYTHON: runtimeStatus.pythonPath || process.env.PYTHON || 'python3',
  };

  try {
    await execFileAsync(ytDlpExecutable, ytDlpArgs, {
      timeout: 180000,
      env: customEnv,
    });
  } catch (dlErr: any) {
    const stderrMsg = dlErr?.stderr?.toString() || '';
    const errorMsg = stderrMsg || dlErr?.message || 'yt-dlp execution failed';
    console.error('[YouTubeDownloader] Real download error:', errorMsg);

    // Provide clear error message without hiding stderr
    throw new Error(`YouTube download failed: ${errorMsg.trim()}`);
  } finally {
    if (tmpCookiesPath && fs.existsSync(tmpCookiesPath)) {
      try { fs.unlinkSync(tmpCookiesPath); } catch {}
    }
  }

  if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 1000) {
    throw new Error('Downloaded YouTube media file is missing, corrupted, or too small.');
  }

  // Probe with ffprobe
  const ffprobeExecutable = resolveFfprobe();
  let durationSeconds = 60;
  let width = 1920;
  let height = 1080;

  try {
    const { stdout } = await execFileAsync(ffprobeExecutable, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      destPath,
    ]);
    const probe = JSON.parse(stdout);
    if (probe.format && probe.format.duration) {
      durationSeconds = Math.round(parseFloat(probe.format.duration));
    }
    const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
    if (videoStream) {
      width = Number(videoStream.width) || width;
      height = Number(videoStream.height) || height;
    }
  } catch (probeErr: any) {
    console.warn('[YouTubeDownloader] ffprobe warning during download probe:', probeErr?.message);
  }

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
