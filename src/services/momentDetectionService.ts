import { ClipCandidate, SourceVideo } from '../types';

export interface AnalyzeSourcesParams {
  workspaceId: string;
  sourceId?: string;
  sourceIds?: string[];
  niche?: string;
  subtopics?: string[];
  userAccessToken?: string;
}

export interface AnalyzeSourcesResponse {
  success: boolean;
  analyzedCount: number;
  candidatesCount: number;
  results: {
    sourceId: string;
    videoTitle: string;
    youtubeUrl: string;
    status: 'analyzed' | 'failed';
    contentStatus: 'transcript_analyzed' | 'metadata_analyzed' | 'content_unavailable';
    candidatesFound: number;
    candidates: any[];
    message: string;
  }[];
  message?: string;
  error?: string;
}

export class MomentDetectionService {
  /**
   * Calls the server moment-detection pipeline to extract candidates and calculate retention scores.
   * Resilient to environment routes (supports both /api/analyze and /.netlify/functions/analyze).
   */
  public static async analyze(params: AnalyzeSourcesParams): Promise<AnalyzeSourcesResponse> {
    const endpoints = ['/api/analyze', '/.netlify/functions/analyze'];
    let lastError: Error | null = null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (params.userAccessToken) {
      headers['Authorization'] = `Bearer ${params.userAccessToken}`;
    }

    const payload = {
      workspaceId: params.workspaceId,
      sourceId: params.sourceId,
      sourceIds: params.sourceIds,
      niche: params.niche,
      subtopics: params.subtopics,
    };

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for multi-source analysis

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = (await response.json()) as AnalyzeSourcesResponse;
          return data;
        }

        const errorJson = await response.json().catch(() => ({}));
        const errMessage = errorJson.message || `Server returned ${response.status}: ${response.statusText}`;
        lastError = new Error(errMessage);
      } catch (err: any) {
        lastError = err;
      }
    }

    throw lastError || new Error('Failed to reach moment analysis server.');
  }
}
