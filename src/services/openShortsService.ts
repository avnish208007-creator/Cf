export interface ProcessVideoParams {
  sourceVideoId: string;
  youtubeUrl: string;
  workspaceId: string;
  niche?: string;
  userAccessToken?: string;
}

export class OpenShortsService {
  public static async processVideo(params: ProcessVideoParams): Promise<{ success: boolean; jobId: string; openShortsJobId: string; status: string; message?: string }> {
    const endpoints = ['/api/openshorts/process', '/.netlify/functions/openshorts-process'];
    let lastError: Error | null = null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (params.userAccessToken) {
      headers['Authorization'] = `Bearer ${params.userAccessToken}`;
    }

    const payload = {
      sourceVideoId: params.sourceVideoId,
      youtubeUrl: params.youtubeUrl,
      workspaceId: params.workspaceId,
      niche: params.niche,
    };

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const data = await response.json();
          return data;
        }

        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.message || `OpenShorts processing failed with status ${response.status}`);
      } catch (err: any) {
        lastError = err;
      }
    }

    throw lastError || new Error('Failed to reach OpenShorts processing service.');
  }

  public static async getJobStatus(jobId: string, workspaceId: string): Promise<any> {
    const endpoint = `/api/openshorts/jobs/${jobId}?workspaceId=${encodeURIComponent(workspaceId)}`;
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch job status: HTTP ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (err: any) {
      console.warn('Error fetching OpenShorts job status:', err);
      throw err;
    }
  }
}
