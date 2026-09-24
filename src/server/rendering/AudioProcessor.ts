export interface AudioProcessingOptions {
  normalize?: boolean;
  targetIntegratedLoudness?: number; // default -16 LUFS for mobile short-form
  targetTruePeak?: number;          // default -1.5 dBTP
  bitrate?: string;                 // default '192k'
}

export interface AudioFilterResult {
  audioFilter: string;
  audioCodec: string;
  audioBitrate: string;
}

export interface IAudioProcessor {
  buildAudioFilter(options?: AudioProcessingOptions): AudioFilterResult;
}

/**
 * Audio Processor
 * Standardizes dynamic range and loudness for vertical short-form platforms (TikTok, Reels, Shorts)
 * using standard broadcast normalization (EBU R128 loudnorm filter).
 */
export class FFmpegAudioProcessor implements IAudioProcessor {
  public buildAudioFilter(options?: AudioProcessingOptions): AudioFilterResult {
    const normalize = options?.normalize !== false;
    const targetLufs = options?.targetIntegratedLoudness ?? -16;
    const targetPeak = options?.targetTruePeak ?? -1.5;
    const bitrate = options?.bitrate || '192k';

    if (normalize) {
      // EBU R128 Loudness Normalization with smooth limiter
      return {
        audioFilter: `loudnorm=I=${targetLufs}:TP=${targetPeak}:LRA=11:print_format=none`,
        audioCodec: 'aac',
        audioBitrate: bitrate,
      };
    }

    return {
      audioFilter: 'volume=1.0',
      audioCodec: 'aac',
      audioBitrate: bitrate,
    };
  }
}
