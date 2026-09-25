import fetch from 'node-fetch';

export interface DispatchWorkflowParams {
  jobId: string;
  sourceVideoId: string;
  youtubeUrl: string;
  workspaceId: string;
}

export async function triggerGitHubWorkflow(params: DispatchWorkflowParams): Promise<{ success: boolean; error?: string }> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY; // e.g. "owner/repo"
  const workflowFile = process.env.GITHUB_WORKFLOW_FILE || 'process-video.yml';

  if (!token) {
    throw new Error('[GITHUB_TOKEN_MISSING] GITHUB_TOKEN or GH_TOKEN environment variable is not configured on the server.');
  }

  if (!repository) {
    throw new Error('[GITHUB_REPOSITORY_MISSING] GITHUB_REPOSITORY environment variable is not configured (e.g. owner/repo).');
  }

  const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/${workflowFile}/dispatches`;
  console.log(`[GitHubWorkflowTrigger] Triggering workflow ${workflowFile} for job ${params.jobId} on repository ${repository}...`);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ClipFlow-Orchestrator/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          jobId: params.jobId,
          videoId: params.sourceVideoId,
          videoUrl: params.youtubeUrl,
          workspaceId: params.workspaceId,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`GitHub API dispatch failed with status ${res.status}: ${errText || res.statusText}`);
    }

    console.log(`[GitHubWorkflowTrigger] Successfully dispatched GitHub workflow for job ${params.jobId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[GitHubWorkflowTrigger] Error dispatching workflow:`, err);
    return { success: false, error: err.message || 'Failed to dispatch GitHub workflow.' };
  }
}

export async function checkGitHubTriggerHealth(): Promise<{ configured: boolean; reachable: boolean; details: string }> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    return { configured: false, reachable: false, details: 'GITHUB_TOKEN or GITHUB_REPOSITORY not configured' };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ClipFlow/1.0',
      },
    });

    if (res.ok) {
      return { configured: true, reachable: true, details: `Connected to repository ${repository}` };
    }
    return { configured: true, reachable: false, details: `GitHub API status ${res.status}` };
  } catch (err: any) {
    return { configured: true, reachable: false, details: `GitHub API error: ${err.message}` };
  }
}
