/**
 * Storage Helpers - Uses local filesystem in development, Vercel Blob in production
 */

import { promises as fs } from 'fs';
import path from 'path';

const USE_LOCAL_STORAGE = !process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * Ensure the uploads directory exists
 */
async function ensureUploadsDir(): Promise<void> {
  try {
    await fs.access(LOCAL_UPLOADS_DIR);
  } catch {
    await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Upload a file to storage (local or Vercel Blob)
 */
export async function uploadToBlob(
  file: File | Buffer,
  filename: string
): Promise<{ url: string; pathname: string }> {
  if (USE_LOCAL_STORAGE) {
    // Local file storage for development
    await ensureUploadsDir();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    const uniqueFilename = `${baseName}-${uniqueSuffix}${ext}`;
    const filePath = path.join(LOCAL_UPLOADS_DIR, uniqueFilename);

    let buffer: Buffer;
    if (Buffer.isBuffer(file)) {
      buffer = file;
    } else {
      const arrayBuffer = await (file as File).arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    await fs.writeFile(filePath, buffer);

    // Return a local URL that can be served by Next.js
    const url = `/api/uploads/${uniqueFilename}`;

    return {
      url,
      pathname: uniqueFilename,
    };
  } else {
    // Production: Use Vercel Blob
    const { put } = await import('@vercel/blob');
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: true,
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
    };
  }
}

/**
 * Delete a file from storage
 */
export async function deleteFromBlob(url: string): Promise<void> {
  try {
    if (USE_LOCAL_STORAGE) {
      // Extract filename from local URL
      const filename = url.replace('/api/uploads/', '');
      const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
      await fs.unlink(filePath);
    } else {
      const { del } = await import('@vercel/blob');
      await del(url);
    }
  } catch (error) {
    console.error('Failed to delete file:', error);
    // Don't throw - cleanup failures shouldn't break the flow
  }
}

/**
 * Download file content from storage
 */
export async function downloadFromBlob(url: string): Promise<Buffer> {
  if (USE_LOCAL_STORAGE) {
    // Extract filename from local URL
    const filename = url.replace('/api/uploads/', '');
    const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
    return fs.readFile(filePath);
  } else {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download from blob: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
