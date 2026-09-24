import { Request, Response } from 'express';
import { runDiscoveryPipeline } from './pipeline';
import { ProviderUnavailableError } from '../providers/types';

export async function handleDiscoveryRequest(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const {
      workspaceId,
      workspaceName,
      niche,
      subtopics,
      language,
      freshness = 'all',
      contentType = 'all',
      knownVideoIds = [],
    } = req.body || {};

    // Extract Bearer token if user is authenticated
    const authHeader = req.headers.authorization || '';
    const userAccessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

    if (!workspaceId || typeof workspaceId !== 'string' || !workspaceId.trim()) {
      res.status(400).json({
        success: false,
        error: 'BAD_REQUEST',
        message: 'A valid workspaceId is required for discovery and database persistence.',
      });
      return;
    }

    const result = await runDiscoveryPipeline({
      workspaceId: workspaceId.trim(),
      workspaceName: workspaceName ? String(workspaceName).trim() : undefined,
      niche: niche ? String(niche).trim() : undefined,
      subtopics: Array.isArray(subtopics) ? subtopics : undefined,
      language: language ? String(language).trim() : undefined,
      freshness,
      contentType,
      knownVideoIds: Array.isArray(knownVideoIds) ? knownVideoIds : [],
      userAccessToken,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error('[Discovery] Express handler discovery error:', err);

    if (err instanceof ProviderUnavailableError || err?.code === 'DISCOVERY_PROVIDER_UNAVAILABLE') {
      res.status(503).json({
        success: false,
        error: 'DISCOVERY_PROVIDER_UNAVAILABLE',
        message:
          err.message ||
          'Discovery provider is unavailable in this execution environment.',
        provider: 'development',
      });
      return;
    }

    res.status(err?.status || 500).json({
      success: false,
      error: 'DISCOVERY_FAILED',
      message: err?.message || 'Discovery execution failed.',
    });
  }
}
