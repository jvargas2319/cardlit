/**
 * Image Preprocessor
 * Enhances images for better OCR accuracy
 */

import sharp from 'sharp';
import type { PreprocessOptions, PageImage } from '@/types';

const DEFAULT_OPTIONS: PreprocessOptions = {
  grayscale: true,
  normalize: true,
  sharpen: true,
  threshold: undefined,
};

export async function preprocessImage(
  buffer: Buffer,
  options: PreprocessOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let pipeline = sharp(buffer);

  // Convert to grayscale for better OCR
  if (opts.grayscale) {
    pipeline = pipeline.grayscale();
  }

  // Normalize contrast
  if (opts.normalize) {
    pipeline = pipeline.normalize();
  }

  // Sharpen text edges
  if (opts.sharpen) {
    pipeline = pipeline.sharpen({
      sigma: 1.5,
      m1: 1.0,
      m2: 0.5,
    });
  }

  // Apply threshold (binary image) - use carefully
  if (opts.threshold !== undefined) {
    pipeline = pipeline.threshold(opts.threshold);
  }

  return pipeline.png().toBuffer();
}

export async function preprocessImages(
  images: PageImage[],
  options: PreprocessOptions = {}
): Promise<PageImage[]> {
  const results: PageImage[] = [];

  for (const image of images) {
    const processed = await preprocessImage(image.buffer, options);
    results.push({
      pageNumber: image.pageNumber,
      buffer: processed,
    });
  }

  return results;
}
