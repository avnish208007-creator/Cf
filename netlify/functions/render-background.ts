import type { Handler, HandlerEvent } from '@netlify/functions';
import { RenderWorker } from '../../src/server/rendering/RenderWorker';

export const handler: Handler = async (event: HandlerEvent) => {
  console.log('[render-background] Starting async background rendering worker task...');

  try {
    if (event.httpMethod !== 'POST') {
      console.error('[render-background] Only POST requests are supported.');
      return { statusCode: 405 };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { jobId } = body;

    if (!jobId) {
      console.error('[render-background] Missing jobId in request body.');
      return { statusCode: 400 };
    }

    console.log(`[render-background] Executing RenderWorker for jobId: ${jobId}`);
    const worker = new RenderWorker();
    const success = await worker.process(jobId);
    console.log(`[render-background] RenderWorker process complete. Success: ${success}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success }),
    };
  } catch (err: any) {
    console.error('[render-background] Fatal worker processing exception:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
