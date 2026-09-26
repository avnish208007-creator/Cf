/**
 * Express Server Piped Resolver Wrapper
 * Re-exports the authoritative ES module resolver implementation from /worker/pipedResolver.js with TypeScript types.
 */
import {
  PipedInstanceManager as JS_PipedInstanceManager,
  pipedInstanceManager as jsPipedInstanceManager,
  extractYouTubeVideoId as jsExtractYouTubeVideoId,
  resolvePipedStream as jsResolvePipedStream,
  checkPipedHealth as jsCheckPipedHealth,
} from '../../../worker/pipedResolver.js';

export interface PipedStreamResult {
  sourceVideoId: string;
  sourceUrl: string;
  videoStreamUrl: string | null;
  audioStreamUrl: string | null;
  combinedUrl: string | null;
  durationSeconds: number;
  title: string;
  thumbnailUrl: string;
  instanceUsed: string;
}

export interface PipedInstanceHealth {
  url: string;
  consecutiveFailures: number;
  lastChecked: number;
  isHealthy: boolean;
  latencyMs: number;
}

export const PipedInstanceManager = JS_PipedInstanceManager;
export const pipedInstanceManager = jsPipedInstanceManager;
export const extractYouTubeVideoId = jsExtractYouTubeVideoId;
export const resolvePipedStream: (youtubeUrlOrId: string) => Promise<PipedStreamResult> = jsResolvePipedStream;
export const checkPipedHealth = jsCheckPipedHealth;
