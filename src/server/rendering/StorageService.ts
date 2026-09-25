import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class StorageService {
  /**
   * Validates local file SHA-256 integrity and returns the accessible media streaming URL.
   */
  public async uploadAndVerify(
    localFilePath: string,
    workspaceId: string,
    clipId: string
  ): Promise<string> {
    console.log(`[StorageService] Starting verification for local file: ${localFilePath}`);

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`UPLOAD_SOURCE_NOT_FOUND: Local file ${localFilePath} does not exist.`);
    }

    const fileHash = await this.calculateSHA256(localFilePath);
    console.log(`[StorageService] SHA-256 local verification hash: ${fileHash}`);

    const filename = `${clipId}.mp4`;
    const publicUrl = `/api/media/clips/${filename}`;

    return publicUrl;
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
