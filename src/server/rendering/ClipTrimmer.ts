export interface TrimBoundaries {
  startSec: number;
  endSec: number;
  durationSec: number;
  startTimeFormatted: string;
  endTimeFormatted: string;
  durationFormatted: string;
}

export interface IClipTrimmer {
  validateAndParse(startTime: string, endTime: string, customDuration?: number): TrimBoundaries;
}

export class TimestampClipTrimmer implements IClipTrimmer {
  public validateAndParse(
    startTime: string,
    endTime: string,
    customDuration?: number
  ): TrimBoundaries {
    const startSec = this.parseTimeToSeconds(startTime);
    let endSec = this.parseTimeToSeconds(endTime);

    if (startSec < 0) {
      throw new Error(`Invalid start time: "${startTime}" must be >= 0.`);
    }

    if (endSec <= startSec) {
      if (customDuration && customDuration > 0) {
        endSec = startSec + customDuration;
      } else {
        throw new Error(
          `Invalid clip boundaries: end time "${endTime}" (${endSec}s) must be greater than start time "${startTime}" (${startSec}s).`
        );
      }
    }

    const durationSec = endSec - startSec;
    if (durationSec < 3) {
      throw new Error(`Clip duration (${durationSec}s) is too short. Minimum duration is 3 seconds.`);
    }

    if (durationSec > 300) {
      throw new Error(`Clip duration (${durationSec}s) exceeds maximum short-form boundary of 300 seconds.`);
    }

    return {
      startSec,
      endSec,
      durationSec,
      startTimeFormatted: this.formatSeconds(startSec),
      endTimeFormatted: this.formatSeconds(endSec),
      durationFormatted: `${Math.round(durationSec)}s`,
    };
  }

  public parseTimeToSeconds(timeStr: string | number): number {
    if (typeof timeStr === 'number') return Math.max(0, timeStr);
    if (!timeStr) return 0;

    const clean = timeStr.trim();
    if (/^\d+(\.\d+)?$/.test(clean)) {
      return parseFloat(clean);
    }

    const parts = clean.split(':').map((p) => parseFloat(p));
    if (parts.some((p) => isNaN(p))) {
      return 0;
    }

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
  }

  public formatSeconds(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
