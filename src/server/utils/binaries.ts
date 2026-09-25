import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export function resolveYtDlp(): string {
  const envPath = process.env.YT_DLP_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  const localBin = path.resolve(process.cwd(), 'bin', 'yt-dlp');
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  const localLinuxBin = path.resolve(process.cwd(), 'bin', 'yt-dlp_linux');
  if (fs.existsSync(localLinuxBin)) {
    return localLinuxBin;
  }
  return 'yt-dlp';
}

export function resolveDeno(): string | null {
  const envPath = process.env.DENO_PATH;
  const candidates = [
    envPath,
    path.resolve(process.cwd(), 'bin', 'deno'),
    path.resolve(process.cwd(), '.deno', 'bin', 'deno'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        execFileSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        return candidate;
      } catch {}
    }
  }

  try {
    const whichOut = execFileSync('which', ['deno'], { encoding: 'utf8' }).trim();
    if (whichOut && fs.existsSync(whichOut)) {
      execFileSync(whichOut, ['--version'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return whichOut;
    }
  } catch {}

  return null;
}

export function resolvePython(): { path: string | null; version: string | null; isPython311Plus: boolean } {
  const envPath = process.env.PYTHON_PATH;
  const candidates = [envPath, 'python3.12', 'python3.11', 'python3', 'python', '/usr/bin/python3', '/usr/local/bin/python3'].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const isPath = candidate.includes('/');
      if (isPath && !fs.existsSync(candidate)) continue;

      const out = execFileSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const match = out.match(/Python\s+([0-9]+\.[0-9]+\.[0-9]+)/i);
      if (match) {
        const verStr = match[1];
        const [major, minor] = verStr.split('.').map(Number);
        const is311Plus = major > 3 || (major === 3 && minor >= 11);
        if (is311Plus) {
          return {
            path: isPath ? candidate : execFileSync('which', [candidate], { encoding: 'utf8' }).trim(),
            version: verStr,
            isPython311Plus: true,
          };
        }
      }
    } catch {}
  }

  return { path: null, version: null, isPython311Plus: false };
}

export function resolveFfmpeg(): string {
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  const localBin = path.resolve(process.cwd(), 'bin', 'ffmpeg');
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return 'ffmpeg';
}

export function resolveFfprobe(): string {
  const envPath = process.env.FFPROBE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  const localBin = path.resolve(process.cwd(), 'bin', 'ffprobe');
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return 'ffprobe';
}

export interface YouTubeRuntimeStatus {
  ready: boolean;
  ytDlpPath: string;
  ytDlpExists: boolean;
  isStandalone: boolean;
  pythonPath: string | null;
  pythonVersion: string | null;
  denoPath: string | null;
  nodePath: string | null;
  jsRuntimeArg: string | null;
  error?: string;
}

export function verifyYouTubeRuntime(): YouTubeRuntimeStatus {
  const ytDlpPath = resolveYtDlp();
  const ytDlpExists = ytDlpPath === 'yt-dlp' || fs.existsSync(ytDlpPath);

  if (!ytDlpExists) {
    return {
      ready: false,
      ytDlpPath,
      ytDlpExists: false,
      isStandalone: false,
      pythonPath: null,
      pythonVersion: null,
      denoPath: null,
      nodePath: null,
      jsRuntimeArg: null,
      error: 'YOUTUBE_RUNTIME_NOT_READY: yt-dlp binary not found in bin/yt-dlp or system PATH.',
    };
  }

  const denoPath = resolveDeno();
  if (!denoPath) {
    return {
      ready: false,
      ytDlpPath,
      ytDlpExists: true,
      isStandalone: ytDlpPath !== 'yt-dlp',
      pythonPath: null,
      pythonVersion: null,
      denoPath: null,
      nodePath: null,
      jsRuntimeArg: null,
      error: 'YOUTUBE_RUNTIME_NOT_READY: No valid Deno JS runtime found or verified.',
    };
  }

  const pythonInfo = resolvePython();
  const jsRuntimeArg = `deno:${denoPath}`;

  try {
    const env: NodeJS.ProcessEnv = { ...process.env };
    const binDir = path.resolve(process.cwd(), 'bin');
    env.PATH = `${binDir}:${env.PATH || ''}`;

    const out = execFileSync(ytDlpPath, ['--version'], { encoding: 'utf8', env }).trim();
    return {
      ready: true,
      ytDlpPath,
      ytDlpExists: true,
      isStandalone: ytDlpPath !== 'yt-dlp',
      pythonPath: pythonInfo.path,
      pythonVersion: pythonInfo.version,
      denoPath,
      nodePath: null,
      jsRuntimeArg,
    };
  } catch (execErr: any) {
    return {
      ready: false,
      ytDlpPath,
      ytDlpExists: true,
      isStandalone: false,
      pythonPath: pythonInfo.path,
      pythonVersion: pythonInfo.version,
      denoPath,
      nodePath: null,
      jsRuntimeArg,
      error: `YOUTUBE_RUNTIME_NOT_READY: Failed to execute yt-dlp: ${execErr?.message || String(execErr)}`,
    };
  }
}
