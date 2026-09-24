import fs from 'fs';
import path from 'path';
import { SubtitleConfig, SubtitleCue } from './types';

export interface GeneratedSubtitleFile {
  assFilePath: string;
  srtFilePath: string;
  cues: SubtitleCue[];
}

export class SubtitleGenerator {
  /**
   * Generates clean, mobile-optimized synchronized subtitles (.ass and .srt formats) from candidate transcript text.
   * Splitting words into short, punchy, high-retention subtitle cues.
   */
  public async generate(
    rawText: string,
    durationSec: number,
    config?: SubtitleConfig
  ): Promise<GeneratedSubtitleFile> {
    console.log(`[SubtitleGenerator] Building mobile-optimized subtitles for transcript (${rawText.length} chars)`);

    const tempDir = path.resolve(process.cwd(), 'temp_media', 'subtitles');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const uniqueId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const assFilePath = path.join(tempDir, `${uniqueId}.ass`);
    const srtFilePath = path.join(tempDir, `${uniqueId}.srt`);

    // Build word chunks and timeline cues
    const cues = this.buildCues(rawText, durationSec, config?.maxWordsPerLine || 6);

    // Format and write SubStation Alpha (.ass) format for styled vertical overlay burning
    const assContent = this.formatASS(cues, config);
    fs.writeFileSync(assFilePath, assContent, 'utf-8');

    // Format and write SubRip Subtitle (.srt) format
    const srtContent = this.formatSRT(cues);
    fs.writeFileSync(srtFilePath, srtContent, 'utf-8');

    return {
      assFilePath,
      srtFilePath,
      cues,
    };
  }

  private buildCues(
    text: string,
    totalDurationSec: number,
    maxWordsPerChunk: number
  ): SubtitleCue[] {
    const cleanText = text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?'"-]/g, '')
      .trim();

    if (!cleanText) {
      return [];
    }

    const words = cleanText.split(' ').filter((w) => w.length > 0);
    if (words.length === 0) return [];

    const chunks: string[] = [];
    let currentChunk: string[] = [];

    for (let i = 0; i < words.length; i++) {
      currentChunk.push(words[i]);
      const lastWord = words[i];
      const hasPunctuation = /[.!?]$/.test(lastWord);

      if (currentChunk.length >= maxWordsPerChunk || (currentChunk.length >= 3 && hasPunctuation)) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    const cueCount = chunks.length;
    const timePerCue = Math.max(1.0, totalDurationSec / cueCount);

    const cues: SubtitleCue[] = [];
    for (let i = 0; i < cueCount; i++) {
      const cueStart = Math.min(totalDurationSec - 0.5, i * timePerCue);
      const cueEnd = Math.min(totalDurationSec, cueStart + timePerCue - 0.05);

      if (cueEnd > cueStart) {
        cues.push({
          startTimeSec: cueStart,
          endTimeSec: cueEnd,
          text: chunks[i],
          isHook: i === 0,
        });
      }
    }

    return cues;
  }

  private formatASS(cues: SubtitleCue[], config?: SubtitleConfig): string {
    const fontSize = config?.fontSize || 22;
    const primaryAssColor = '&H00FFFFFF'; // White
    const outlineColor = '&H00000000';    // Black outline

    let ass = `[Script Info]
Title: ClipFlow Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize * 2},${primaryAssColor},&H000000FF,${outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,80,80,180,1
Style: HookStyle,Arial,${(fontSize + 3) * 2},&H0000FFFF,&H000000FF,${outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,3.5,0,2,80,80,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    for (const cue of cues) {
      const startStr = this.formatASSTime(cue.startTimeSec);
      const endStr = this.formatASSTime(cue.endTimeSec);
      const styleName = cue.isHook ? 'HookStyle' : 'Default';

      let lineText = cue.text;
      const words = lineText.split(' ');
      if (words.length > 5) {
        const mid = Math.ceil(words.length / 2);
        lineText = `${words.slice(0, mid).join(' ')}\\N${words.slice(mid).join(' ')}`;
      }

      ass += `Dialogue: 0,${startStr},${endStr},${styleName},,0,0,0,,${lineText}\n`;
    }

    return ass;
  }

  private formatSRT(cues: SubtitleCue[]): string {
    let srt = '';
    cues.forEach((cue, index) => {
      const startStr = this.formatSRTTime(cue.startTimeSec);
      const endStr = this.formatSRTTime(cue.endTimeSec);
      srt += `${index + 1}\n${startStr} --> ${endStr}\n${cue.text}\n\n`;
    });
    return srt;
  }

  private formatASSTime(seconds: number): string {
    const s = Math.max(0, seconds);
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const cs = Math.floor((s % 1) * 100);

    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }

  private formatSRTTime(seconds: number): string {
    const s = Math.max(0, seconds);
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }
}
