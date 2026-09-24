import { SupabaseClient } from '@supabase/supabase-js';

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
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Safe status transitions ensuring only allowed V1 states are set.
   */
  public async transition(
    jobId: string,
    status: JobStatus,
    progress: number,
    stage: string,
    errorDetails?: { code: string; message: string }
  ): Promise<void> {
    console.log(`[RenderJobService] Transitioning job ${jobId} to state "${status}" [${progress}%] - ${stage}`);

    // Standard database fields mapped from our V1 architecture
    const updateData: any = {
      status: status === 'completed' || status === 'failed' ? status : 'running',
      stage: status, // Align stage to allowed V1 states
      progress,
      completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null,
    };

    if (errorDetails) {
      updateData.error_code = errorDetails.code;
      updateData.error_message = errorDetails.message;
      updateData.status = 'failed';
      updateData.stage = 'failed';
    }

    const { error } = await this.supabase
      .from('jobs')
      .update(updateData)
      .eq('id', jobId);

    if (error) {
      console.error(`[RenderJobService] Failed to update job ${jobId} in Supabase:`, error.message);
    }
  }
}
