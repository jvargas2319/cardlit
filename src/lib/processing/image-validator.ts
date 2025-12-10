/**
 * Image validation utility using magic byte detection
 */

export interface ImageValidationResult {
  isValid: boolean;
  mimeType: string | null;
  error?: string;
}

/**
 * Validate image buffer by checking magic bytes
 */
export function validateImageBuffer(buffer: Buffer): ImageValidationResult {
  if (buffer.length < 12) {
    return { isValid: false, mimeType: null, error: 'File too small to be a valid image' };
  }

  // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, mimeType: 'image/png' };
  }

  // Check JPEG signature: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, mimeType: 'image/jpeg' };
  }

  // Check WebP signature: RIFF....WEBP
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return { isValid: true, mimeType: 'image/webp' };
  }

  return {
    isValid: false,
    mimeType: null,
    error: 'Unsupported image format. Please use PNG, JPG, or WebP.',
  };
}

/**
 * Check if filename has a supported image extension
 */
export function isImageExtension(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ['png', 'jpg', 'jpeg', 'webp'].includes(ext || '');
}

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
