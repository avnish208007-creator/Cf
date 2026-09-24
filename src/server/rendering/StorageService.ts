import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

export class StorageService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Uploads rendered clip, downloads it back, validates SHA-256 matching, and returns the public url.
   * Ensuring maximum integrity and zero corrupted files.
   */
  public async uploadAndVerify(
    localFilePath: string,
    workspaceId: string,
    clipId: string
  ): Promise<string> {
    console.log(`[StorageService] Starting secure verification upload for: ${localFilePath}`);

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`UPLOAD_SOURCE_NOT_FOUND: Local file ${localFilePath} does not exist.`);
    }

    const objectPath = `${workspaceId}/${clipId}.mp4`;
    const fileBuffer = fs.readFileSync(localFilePath);

    // 1. Upload to Supabase Storage bucket 'clips'
    const { error: uploadError } = await this.supabase.storage
      .from('clips')
      .upload(objectPath, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`SUPABASE_STORAGE_UPLOAD_FAILED: ${uploadError.message}`);
    }

    console.log(`[StorageService] Successfully uploaded to clips bucket. Verifying SHA-256 integrity...`);

    // 2. Download the exact uploaded object back to verify matching hash
    const { data: downloadData, error: downloadError } = await this.supabase.storage
      .from('clips')
      .download(objectPath);

    if (downloadError || !downloadData) {
      throw new Error(`SUPABASE_STORAGE_VERIFICATION_DOWNLOAD_FAILED: ${downloadError?.message || 'Empty file received'}`);
    }

    // Save download to temp verify file
    const tempVerifyDir = path.resolve(process.cwd(), 'temp_media', 'verification');
    if (!fs.existsSync(tempVerifyDir)) {
      fs.mkdirSync(tempVerifyDir, { recursive: true });
    }

    const tempVerifyPath = path.join(tempVerifyDir, `verify_${clipId}.mp4`);
    const arrayBuffer = await downloadData.arrayBuffer();
    fs.writeFileSync(tempVerifyPath, Buffer.from(arrayBuffer));

    // 3. Compute and compare SHA-256 hashes
    const originalHash = await this.calculateSHA256(localFilePath);
    const downloadedHash = await this.calculateSHA256(tempVerifyPath);

    // Clean up temp verify file immediately
    try { fs.unlinkSync(tempVerifyPath); } catch (_) {}

    if (originalHash !== downloadedHash) {
      throw new Error(`SHA256_INTEGRITY_MISMATCH: Uploaded file checksum (${downloadedHash}) does not match original local file checksum (${originalHash})!`);
    }

    console.log(`[StorageService] SHA-256 verification MATCHED: ${originalHash}`);

    // 4. Retrieve public URL
    const { data } = this.supabase.storage.from('clips').getPublicUrl(objectPath);
    if (!data || !data.publicUrl) {
      throw new Error('FAILED_TO_GET_PUBLIC_URL_FROM_SUPABASE_STORAGE');
    }

    return data.publicUrl;
  }

  private calculateSHA256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }
}
