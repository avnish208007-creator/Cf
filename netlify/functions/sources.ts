import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { db, DEFAULT_WORKSPACE_ID } from '../../src/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: defaultHeaders,
      body: '',
    };
  }

  const workspaceId =
    event.queryStringParameters?.workspaceId ||
    (event.body ? JSON.parse(event.body).workspaceId : DEFAULT_WORKSPACE_ID);

  const effectiveWsId = (workspaceId || DEFAULT_WORKSPACE_ID).trim();

  try {
    const sourcesColRef = collection(db, 'workspaces', effectiveWsId, 'sources');
    const q = query(sourcesColRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const records = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify({
        success: true,
        sources: records,
        workspaceId: effectiveWsId,
        count: records.length,
      }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({
        success: false,
        error: 'FETCH_SOURCES_FAILED',
        message: err.message || 'An unexpected error occurred while fetching sources.',
      }),
    };
  }
};
