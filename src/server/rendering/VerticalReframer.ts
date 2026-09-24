export interface ReframeOptions {
  mode?: 'centered_crop' | 'blurred_stack' | 'contain_pad';
  targetWidth?: number;
  targetHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface ReframeFilterResult {
  videoFilter: string;
  width: number;
  height: number;
  aspectRatio: '9:16';
}

export interface IVerticalReframer {
  buildReframeFilter(options?: ReframeOptions): ReframeFilterResult;
}

/**
 * Smart Vertical Reframer
 * Converts any aspect ratio into pure 9:16 vertical video without stretching or distortion.
 */
export class SmartVerticalReframer implements IVerticalReframer {
  private defaultWidth: number;
  private defaultHeight: number;

  constructor(targetWidth = 1080, targetHeight = 1920) {
    this.defaultWidth = targetWidth;
    this.defaultHeight = targetHeight;
  }

  public buildReframeFilter(options?: ReframeOptions): ReframeFilterResult {
    const width = options?.targetWidth || this.defaultWidth;
    const height = options?.targetHeight || this.defaultHeight;
    const mode = options?.mode || 'centered_crop';

    let filter = '';

    switch (mode) {
      case 'blurred_stack':
        // Professional stacked short-form effect:
        // Background: zoomed and blurred 9:16 video
        // Foreground: sharp original video centered without cropping
        filter = `split[vbg][vfg]; [vbg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:5,eq=brightness=-0.08[bg]; [vfg]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg]; [bg][fg]overlay=(W-w)/2:(H-h)/2`;
        break;

      case 'contain_pad':
        // Clean letterbox containment with black background
        filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
        break;

      case 'centered_crop':
      default:
        // Sharp centered 9:16 crop preserving center speaker / focal subject
        // 1. Scales to height 1920
        // 2. Crops 1080 width at exact horizontal center: (iw - 1080)/2
        // 3. Guarantees no geometric stretching
        filter = `scale=-2:${height},crop=${width}:${height}:(in_w-${width})/2:0`;
        break;
    }

    return {
      videoFilter: filter,
      width,
      height,
      aspectRatio: '9:16',
    };
  }
}
