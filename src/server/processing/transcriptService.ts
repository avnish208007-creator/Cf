import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { YoutubeTranscript } from 'youtube-transcript';
import { GoogleGenAI } from '@google/genai';
import { resolveFfmpeg } from '../utils/binaries';

const execFileAsync = promisify(execFile);

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  segments: TranscriptSegment[];
  formattedTranscript: string;
  source: 'youtube_captions' | 'gemini_audio_transcription';
}

function extractYouTubeVideoId(urlOrId: string): string {
  const trimmed = (urlOrId || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match ? match[1] : trimmed;
}

function cleanHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n/g, ' ')
    .trim();
}

function formatSeconds(sec: number): string {
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export async function extractTranscript(
  youtubeUrl: string,
  sourceMp4Path: string,
  tmpDir: string,
  jobId: string
): Promise<TranscriptResult> {
  const videoId = extractYouTubeVideoId(youtubeUrl);

  // Strategy 1: Fetch real YouTube captions using youtube-transcript
  if (videoId) {
    try {
      console.log(`[TranscriptService] Attempting to fetch YouTube captions for videoId "${videoId}"...`);
      const items = await YoutubeTranscript.fetchTranscript(videoId);
      if (Array.isArray(items) && items.length > 0) {
        const segments: TranscriptSegment[] = items.map((item) => {
          const startSec = Math.max(0, Math.floor(item.offset / 1000));
          const durationSec = Math.max(1, Math.ceil(item.duration / 1000));
          return {
            start: startSec,
            end: startSec + durationSec,
            text: cleanHtmlEntities(item.text),
          };
        });

        const formattedTranscript = segments
          .map((s) => `[${formatSeconds(s.start)} - ${formatSeconds(s.end)}] ${s.text}`)
          .join('\n');

        console.log(`[TranscriptService] Successfully fetched ${segments.length} transcript segments from YouTube captions.`);
        return {
          segments,
          formattedTranscript,
          source: 'youtube_captions',
        };
      }
    } catch (ytCapErr: any) {
      console.warn(`[TranscriptService] YouTube captions unavailable (${ytCapErr?.message || ytCapErr}), falling back to audio transcription...`);
    }
  }

  // Strategy 2: Extract audio from local MP4 and transcribe with Gemini Audio
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for audio transcription.');
  }

  if (!fs.existsSync(sourceMp4Path)) {
    throw new Error(`Source video file does not exist at ${sourceMp4Path}`);
  }

  const audioMp3Path = path.resolve(tmpDir, `${jobId}_audio.mp3`);
  const ffmpegExecutable = resolveFfmpeg();

  console.log(`[TranscriptService] Extracting audio to "${audioMp3Path}" for Gemini audio transcription...`);

  try {
    await execFileAsync(ffmpegExecutable, [
      '-y',
      '-i', sourceMp4Path,
      '-vn',
      '-acodec', 'libmp3lame',
      '-ar', '16000',
      '-ac', '1',
      '-b:a', '64k',
      audioMp3Path,
    ], { timeout: 60000 });
  } catch (audioErr: any) {
    throw new Error(`FFmpeg audio extraction failed: ${audioErr?.message || audioErr}`);
  }

  if (!fs.existsSync(audioMp3Path) || fs.statSync(audioMp3Path).size < 500) {
    throw new Error('Audio extraction produced empty or invalid audio file.');
  }

  const audioBytes = fs.readFileSync(audioMp3Path);
  const audioBase64 = audioBytes.toString('base64');

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  const transcriptionModel = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-3.5-transcribe';

  console.log(`[TranscriptService] Transcribing audio with Gemini model "${transcriptionModel}"...`);

  const prompt = `Transcribe this audio file accurately. Return a JSON array of timestamped transcript segments where each segment has:
- "start": number (start time in seconds, e.g. 0.0)
- "end": number (end time in seconds, e.g. 14.2)
- "text": string (spoken text)

Return ONLY a valid JSON array.`;

  try {
    const response = await ai.models.generateContent({
      model: transcriptionModel,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/mp3',
                data: audioBase64,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
    });

    const text = response.text || '[]';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const segments: TranscriptSegment[] = parsed.map((item: any) => ({
        start: Math.max(0, Math.floor(Number(item.start) || 0)),
        end: Math.max(1, Math.ceil(Number(item.end) || Number(item.start) + 5)),
        text: String(item.text || '').trim(),
      }));

      const formattedTranscript = segments
        .map((s) => `[${formatSeconds(s.start)} - ${formatSeconds(s.end)}] ${s.text}`)
        .join('\n');

      // Cleanup temp audio file
      try {
        if (fs.existsSync(audioMp3Path)) fs.unlinkSync(audioMp3Path);
      } catch {}

      console.log(`[TranscriptService] Successfully transcribed audio into ${segments.length} segments.`);
      return {
        segments,
        formattedTranscript,
        source: 'gemini_audio_transcription',
      };
    }

    throw new Error('Gemini audio transcription returned empty or invalid segment data.');
  } catch (genErr: any) {
    // Cleanup temp audio file
    try {
      if (fs.existsSync(audioMp3Path)) fs.unlinkSync(audioMp3Path);
    } catch {}
    throw new Error(`Audio transcription failed: ${genErr?.message || genErr}`);
  }
}
