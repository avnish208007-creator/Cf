import {
  UserSession,
  WorkspaceConfig,
  SourceVideo,
  ClipCandidate,
  Clip,
  QueueItem,
  ActiveJob,
  ActivityItem,
} from '../types';

export const INITIAL_USER: UserSession = {
  id: 'usr_default',
  name: 'Alex Rivera',
  email: 'alex@apexmedia.io',
  avatarInitials: 'AR',
};

/**
 * DEFAULT WORKSPACE CONFIGURATION
 * Initial state before onboarding or Firebase load
 */
export const INITIAL_WORKSPACE: WorkspaceConfig = {
  workspaceName: 'Media Operations Hub',
  brandName: 'Apex Media',
  mainNiche: 'Autonomous AI Systems & Infrastructure',
  subtopics: [
    'AI Agents & Automation',
    'Local LLM Deployments',
    'Vector Databases & Retrieval',
    'Engineering Leadership',
  ],
  contentLanguage: 'English (US)',
  contentStyle: 'High-signal technical breakdown with data-backed insights',
  aspectRatio: '9:16',
  targetPlatforms: ['YouTube Shorts', 'Instagram Reels', 'TikTok'],
  minCandidateScore: 82,
  targetDuration: '30-60s',
};

/**
 * CLEAN INITIAL PRODUCTION STATE
 *
 * In accordance with ClipFlow production architecture:
 * - Firebase is the single source of truth.
 * - No mock videos, fake candidates, dummy clips, or artificial metrics are presented as real data.
 * - If discovery has not been run or database tables are empty, clean zero-state UI is rendered.
 */
export const INITIAL_SOURCES: SourceVideo[] = [];
export const INITIAL_CANDIDATES: ClipCandidate[] = [];
export const INITIAL_CLIPS: Clip[] = [];
export const INITIAL_QUEUE: QueueItem[] = [];
export const INITIAL_JOBS: ActiveJob[] = [];
export const INITIAL_ACTIVITY: ActivityItem[] = [];
