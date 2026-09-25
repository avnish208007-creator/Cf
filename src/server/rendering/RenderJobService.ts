import { supabase } from '../../lib/supabase';

export type JobStatus =
  | 'queued'
  | 'acquiring_media'
  | 'validating_source'
  | 'rendering'
  | 'validating_output'
  | 'uploading'
  | 'completed'
  | 'failed';

export class RenderJobService {
  public async transition(
    jobId: string,
    status: JobStatus,
    progress: number,
    stage: string,
    errorDetails?: { code: string; message: string }
  ): Promise<void> {
    console.log(`[RenderJobService] Transitioning job ${jobId} to state "${status}" [${progress}%] - ${stage}`);

    const updateData: any = {
      status: status === 'completed' || status === 'failed' ? status : 'running',
      stage: status,
      progress,
      completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null,
    };

    if (errorDetails) {
      updateData.error_code = errorDetails.code;
      updateData.error_message = errorDetails.message;
      updateData.status = 'failed';
      updateData.stage = 'failed';
    }

    try {
      const { error } = await supabase
        .from('render_jobs')
        .update(updateData)
        .eq('id', jobId);

      if (error) {
        console.warn(`[RenderJobService] Notice updating job ${jobId} in Supabase:`, error.message);
      }
    } catch (error: any) {
      console.error(`[RenderJobService] Exception updating job ${jobId}:`, error.message);
    }
  }
}
