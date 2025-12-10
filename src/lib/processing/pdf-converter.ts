/**
 * PDF to Image Converter
 * Adapted for Next.js/Vercel - works with buffers and supports batch processing
 */

import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PageImage } from '@/types';

/**
 * Get page count from PDF buffer quickly using pdf-lib
 */
export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const pdfDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  return pdfDoc.getPageCount();
}

/**
 * Convert specific pages of a PDF to images
 * Designed for batch processing on Vercel (processes a range of pages)
 */
export async function convertPdfPagesToImages(
  buffer: Buffer,
  options: {
    startPage: number;
    endPage: number;
    dpi?: number;
  }
): Promise<PageImage[]> {
  const { startPage, endPage, dpi = 300 } = options;
  const scale = dpi / 72;

  // pdf-to-img requires a file path, so we need to write to temp file
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);

  try {
    // Write buffer to temp file
    fs.writeFileSync(tempFile, buffer);

    // Dynamic import for ESM compatibility
    const { pdf } = await import('pdf-to-img');

    const images: PageImage[] = [];
    const document = await pdf(tempFile, { scale });

    let pageNumber = 0;

    for await (const page of document) {
      pageNumber++;

      // Skip pages before startPage
      if (pageNumber < startPage) continue;

      // Stop after endPage
      if (pageNumber > endPage) break;

      images.push({
        pageNumber,
        buffer: Buffer.from(page),
      });
    }

    return images;
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Convert PDF from URL (Vercel Blob or local) to images
 * Downloads, processes batch, returns images
 */
export async function convertPdfFromUrlToImages(
  url: string,
  options: {
    startPage: number;
    endPage: number;
    dpi?: number;
  }
): Promise<PageImage[]> {
  // Use downloadFromBlob which handles both local and remote storage
  const { downloadFromBlob } = await import('@/lib/storage/blob');
  const buffer = await downloadFromBlob(url);

  return convertPdfPagesToImages(buffer, options);
}

/**
 * Get page count from PDF at URL (Vercel Blob or local)
 */
export async function getPdfPageCountFromUrl(url: string): Promise<number> {
  // Use downloadFromBlob which handles both local and remote storage
  const { downloadFromBlob } = await import('@/lib/storage/blob');
  const buffer = await downloadFromBlob(url);

  return getPdfPageCount(buffer);
}
