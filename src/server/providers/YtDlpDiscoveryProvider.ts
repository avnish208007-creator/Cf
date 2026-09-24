import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  IDiscoveryProvider,
  DiscoveredVideo,
  SearchQueryOptions,
  ProviderUnavailableError,
  ProviderExecutionError,
} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class YtDlpDiscoveryProvider implements IDiscoveryProvider {
  public readonly name = 'yt-dlp';

  /**
   * Find candidate locations for the yt-dlp executable
   */
  private getCandidatePaths(): string[] {
    const candidates: string[] = [];

    if (process.env.YT_DLP_PATH) {
      candidates.push(process.env.YT_DLP_PATH);
    }

    // Project bin directory
    candidates.push(path.resolve(process.cwd(), 'bin/yt-dlp'));
    candidates.push(path.resolve(__dirname, '../../bin/yt-dlp'));
    candidates.push(path.resolve(__dirname, '../../../bin/yt-dlp'));

    // Serverless writable /tmp location
    candidates.push('/tmp/yt-dlp');

    // System PATH
    candidates.push('yt-dlp');

    return candidates;
  }

  /**
   * Locate the usable yt-dlp executable path, or auto-stage to /tmp if python3 exists
   */
  public async resolveExecutablePath(): Promise<string | null> {
    const candidates = this.getCandidatePaths();

    for (const candidate of candidates) {
      if (candidate === 'yt-dlp') {
        // Will check if in PATH via which
        continue;
      }
      if (fs.existsSync(candidate)) {
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
          return candidate;
        } catch {
          try {
            fs.chmodSync(candidate, 0o755);
            return candidate;
          } catch {
            // unable to chmod, continue
          }
        }
      }
    }

    // Check system PATH
    const inPath = await new Promise<boolean>((resolve) => {
      execFile('which', ['yt-dlp'], (err, stdout) => {
        if (!err && stdout.trim()) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });

    if (inPath) {
      return 'yt-dlp';
    }

    return null;
  }

  /**
   * Checks if Python 3 runtime is available
   */
  private async checkPythonRuntime(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('python3', ['--version'], { timeout: 3000 }, (err) => {
        resolve(!err);
      });
    });
  }

  /**
   * Verify whether yt-dlp is available and executable in the current environment
   */
  public async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    // 1. Check Python 3 runtime
    const hasPython = await this.checkPythonRuntime();
    if (!hasPython) {
      return {
        available: false,
        reason:
          'Python 3 runtime is not installed or accessible in this serverless environment. yt-dlp requires Python 3.',
      };
    }

    // 2. Locate executable
    const execPath = await this.resolveExecutablePath();
    if (!execPath) {
      return {
        available: false,
        reason:
          'yt-dlp executable was not found in bin/yt-dlp, /tmp/yt-dlp, or system PATH.',
      };
    }

    // 3. Test execution of yt-dlp --version
    return new Promise((resolve) => {
      execFile(execPath, ['--version'], { timeout: 4000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({
            available: false,
            reason: `yt-dlp execution test failed: ${err.message}. Stderr: ${stderr.slice(0, 200)}`,
          });
        } else {
          resolve({ available: true });
        }
      });
    });
  }

  /**
   * Search YouTube using yt-dlp without downloading videos or requiring API credentials
   */
  public async search(options: SearchQueryOptions): Promise<DiscoveredVideo[]> {
    const { query, maxResults, subtopic } = options;

    const availability = await this.isAvailable();
    if (!availability.available) {
      throw new ProviderUnavailableError(
        availability.reason ||
          'yt-dlp discovery provider is not available in the execution environment.'
      );
    }

    const execPath = (await this.resolveExecutablePath()) || 'yt-dlp';

    // Build resource-efficient search arguments
    const searchTarget = `ytsearch${Math.max(1, Math.min(maxResults || 5, 10))}:${query}`;
    const args = [
      searchTarget,
      '--dump-single-json',
      '--flat-playlist',
      '--skip-download',
      '--no-warnings',
      '--no-check-certificates',
      '--socket-timeout',
      '15',
    ];

    const jsonOutput = await this.runYtDlp(execPath, args);

    if (!jsonOutput || !jsonOutput.trim()) {
      throw new ProviderExecutionError(
        `yt-dlp returned empty output for search query: "${query}"`
      );
    }

    return this.parseYtDlpOutput(jsonOutput, query, subtopic);
  }

  /**
   * Spawn yt-dlp child process and collect stdout
   */
  private runYtDlp(execPath: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(execPath, args, {
        timeout: 30000,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        reject(
          new ProviderExecutionError(
            `Failed to start yt-dlp process: ${err.message}`
          )
        );
      });

      child.on('close', (code) => {
        if (stdout.trim()) {
          // yt-dlp may print deprecation warnings to stderr while stdout has valid JSON
          resolve(stdout);
        } else if (code !== 0) {
          reject(
            new ProviderExecutionError(
              `yt-dlp exited with code ${code}. Stderr: ${stderr.slice(0, 300)}`
            )
          );
        } else {
          resolve('');
        }
      });
    });
  }

  /**
   * Parse yt-dlp JSON output into standard DiscoveredVideo structures
   */
  private parseYtDlpOutput(
    rawJson: string,
    query: string,
    subtopic?: string
  ): DiscoveredVideo[] {
    let parsed: any;
    try {
      // Find JSON beginning in case of any leading text
      const firstBrace = rawJson.indexOf('{');
      if (firstBrace === -1) {
        throw new Error('No JSON object found in output');
      }
      parsed = JSON.parse(rawJson.slice(firstBrace));
    } catch (err: any) {
      throw new ProviderExecutionError(
        `Failed to parse yt-dlp JSON response: ${err?.message || 'Invalid JSON'}`
      );
    }

    const entries = Array.isArray(parsed.entries)
      ? parsed.entries
      : parsed._type === 'url'
      ? [parsed]
      : [];

    const discovered: DiscoveredVideo[] = [];

    const gradientPalette = [
      'from-slate-900 via-indigo-950 to-slate-900',
      'from-blue-950 via-slate-900 to-black',
      'from-neutral-900 via-slate-900 to-slate-950',
      'from-slate-800 via-slate-900 to-black',
      'from-zinc-900 via-cyan-950 to-slate-900',
    ];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;

      const videoId = entry.id;
      if (!videoId || typeof videoId !== 'string') continue;

      const title = (entry.title || 'Untitled YouTube Video').trim();
      const channelTitle = (
        entry.channel ||
        entry.uploader ||
        entry.uploader_id ||
        'YouTube Creator'
      ).trim();

      const durationSec = typeof entry.duration === 'number' ? Math.round(entry.duration) : 0;
      const durationFormatted = this.formatDuration(durationSec);

      const viewCount = typeof entry.view_count === 'number' ? entry.view_count : 0;

      // Extract description / summary snippet
      let summary = (entry.description || '').trim().replace(/\s+/g, ' ');
      if (!summary) {
        summary = `High-density source talk on "${subtopic || query}". Suitable for automated moment detection.`;
      } else if (summary.length > 200) {
        summary = summary.slice(0, 197) + '...';
      }

      // Compute keyword relevance score
      const relevanceScore = this.calculateRelevance(title, summary, query, subtopic);

      const thumbnailGradient = gradientPalette[i % gradientPalette.length];

      // Extract thumbnail if available
      let thumbnailUrl: string | undefined;
      if (Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0) {
        thumbnailUrl = entry.thumbnails[entry.thumbnails.length - 1]?.url;
      }

      discovered.push({
        id: videoId,
        title,
        channelTitle,
        duration: durationFormatted,
        durationSeconds: durationSec,
        viewCount,
        publishedAt: 'Recently Discovered',
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        summary,
        niche: subtopic || query,
        thumbnailGradient,
        thumbnailUrl,
        relevanceScore,
      });
    }

    return discovered;
  }

  /**
   * Format seconds into MM:SS or HH:MM:SS
   */
  private formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '10:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Deterministic relevance scoring based on title and description keyword density
   */
  private calculateRelevance(
    title: string,
    summary: string,
    query: string,
    subtopic?: string
  ): number {
    let score = 88;
    const combined = `${title} ${summary}`.toLowerCase();

    const targetWords = [
      ...query.toLowerCase().split(/\s+/),
      ...(subtopic ? subtopic.toLowerCase().split(/\s+/) : []),
    ].filter((w) => w.length > 3);

    for (const word of targetWords) {
      if (title.toLowerCase().includes(word)) {
        score += 3;
      } else if (combined.includes(word)) {
        score += 1;
      }
    }

    return Math.min(98, Math.max(86, score));
  }
}
