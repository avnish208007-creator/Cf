import { RenderRequest, RenderResult } from '../server/rendering/types';

export interface ClientRenderParams {
  candidateId: string;
  workspaceId: string;
  sourceVideoId?: string;
  sourceTitle: string;
  channelTitle: string;
  startTime: string;
  endTime: string;
  durationSeconds?: number;
  hook: string;
  transcriptText?: string;
  summary?: string;
  sourceYoutubeUrl?: string;
  mediaUrl?: string;
  mediaPath?: string;
  reframeMode?: 'centered_crop' | 'blurred_stack' | 'contain_pad';
  subtitles?: {
    style?: 'clean' | 'minimal' | 'bold_highlight' | 'karaoke';
    fontSize?: number;
    primaryColor?: string;
    secondaryColor?: string;
  };
  branding?: {
    enabled: boolean;
    brandName?: string;
    logoUrl?: string;
    primaryColor?: string;
  };
  userAccessToken?: string;
}

export class ClientRenderService {
  /**
   * Invokes the backend rendering pipeline for a selected candidate.
   * The backend automatically acquires source media via the CompliantMediaProvider.
   */
  public static async renderClip(params: ClientRenderParams): Promise<RenderResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (params.userAccessToken) {
      headers['Authorization'] = `Bearer ${params.userAccessToken}`;
    }

    const payload: RenderRequest = {
      candidateId: params.candidateId,
      workspaceId: params.workspaceId,
      sourceVideoId: params.sourceVideoId,
      sourceTitle: params.sourceTitle,
      channelTitle: params.channelTitle,
      startTime: params.startTime,
      endTime: params.endTime,
      durationSeconds: params.durationSeconds,
      hook: params.hook,
      transcriptText: params.transcriptText || params.hook,
      summary: params.summary,
      sourceYoutubeUrl: params.sourceYoutubeUrl,
      mediaUrl: params.mediaUrl,
      mediaPath: params.mediaPath,
      reframeMode: params.reframeMode || 'centered_crop',
      subtitles: params.subtitles,
      branding: params.branding,
    };

    // Try primary API route and fallback to Netlify Function route
    const endpoints = ['/api/render', '/.netlify/functions/render'];
    let lastError: any = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        return data as RenderResult;
      } catch (err: any) {
        lastError = err;
        console.warn(`[ClientRenderService] Failed calling ${endpoint}:`, err);
      }
    }

    return {
      success: false,
      clipId: `clip_${params.candidateId.slice(0, 8)}`,
      jobId: `job_${Date.now()}`,
      status: 'failed',
      durationSeconds: 0,
      durationFormatted: '00:00',
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      errorCode: 'SERVICE_UNREACHABLE',
      errorMessage: 'Source media could not be acquired automatically.',
      technicalDetails: lastError?.message || 'Failed to connect to rendering service.',
    };
  }
}
