/**
 * Google Cloud Vision OCR Engine
 * High-accuracy OCR using Google's Document Text Detection
 * Supports both API key and Service Account authentication
 */

import type { PageImage, OCRResult } from '@/types';

interface TextAnnotation {
  description: string;
  boundingPoly?: {
    vertices: Array<{ x: number; y: number }>;
  };
}

interface FullTextAnnotation {
  text: string;
  pages?: Array<{
    confidence?: number;
  }>;
}

interface AnnotateImageResponse {
  textAnnotations?: TextAnnotation[];
  fullTextAnnotation?: FullTextAnnotation;
  error?: { message: string; code?: number };
}

interface BatchAnnotateResponse {
  responses: AnnotateImageResponse[];
}

export class GoogleVisionOCR {
  private client: unknown;
  private initialized = false;
  private projectId: string;
  private languages: string[];
  private apiKey: string | null = null;
  private useRestApi = false;

  constructor(options: { projectId?: string; languages?: string[] } = {}) {
    this.projectId = options.projectId || process.env.GOOGLE_CLOUD_PROJECT || 'vocab-extractor';
    this.languages = options.languages || ['en'];
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check for API key first (simpler setup)
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_CLOUD_PROJECT;
    if (apiKey && apiKey.startsWith('AIza')) {
      this.apiKey = apiKey;
      this.useRestApi = true;
      this.initialized = true;
      console.log('Google Vision initialized with API key');
      return;
    }

    try {
      // Handle credentials from environment variable (base64 encoded for Vercel)
      if (process.env.GOOGLE_CREDENTIALS_BASE64) {
        const credentials = JSON.parse(
          Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
        );

        const vision = await import('@google-cloud/vision');
        this.client = new vision.ImageAnnotatorClient({
          credentials,
          projectId: this.projectId,
        });
      } else {
        // Fall back to ADC or service account file
        const vision = await import('@google-cloud/vision');
        this.client = new vision.ImageAnnotatorClient({
          projectId: this.projectId,
        });
      }

      this.initialized = true;
      console.log('Google Vision initialized with service account');
    } catch (error) {
      throw new Error(
        `Failed to initialize Google Vision.\n` +
        `Make sure you have configured Google Cloud credentials.\n` +
        `Error: ${error}`
      );
    }
  }

  private async processImageWithRestApi(image: PageImage): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      const requestBody = {
        requests: [
          {
            image: { content: image.buffer.toString('base64') },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: {
              languageHints: this.languages,
            },
          },
        ],
      };

      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vision API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as BatchAnnotateResponse;
      const result = data.responses[0];

      if (result.error) {
        throw new Error(result.error.message);
      }

      const fullText = result.fullTextAnnotation?.text || '';
      const confidence = (result.fullTextAnnotation?.pages?.[0]?.confidence ?? 0.9) * 100;

      return {
        pageNumber: image.pageNumber,
        text: fullText,
        confidence,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`Error on page ${image.pageNumber}:`, error);
      return {
        pageNumber: image.pageNumber,
        text: '',
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }
  }

  async processImage(image: PageImage): Promise<OCRResult> {
    if (!this.initialized) {
      throw new Error('Google Vision not initialized. Call initialize() first.');
    }

    if (this.useRestApi) {
      return this.processImageWithRestApi(image);
    }

    if (!this.client) {
      throw new Error('Google Vision client not available.');
    }

    const startTime = Date.now();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [result] = await (this.client as any).documentTextDetection({
        image: { content: image.buffer.toString('base64') },
        imageContext: {
          languageHints: this.languages,
        },
      });

      const response = result as AnnotateImageResponse;

      if (response.error) {
        throw new Error(response.error.message);
      }

      const fullText = response.fullTextAnnotation?.text || '';
      const confidence =
        (response.fullTextAnnotation?.pages?.[0]?.confidence ?? 0.9) * 100;

      return {
        pageNumber: image.pageNumber,
        text: fullText,
        confidence,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`Error on page ${image.pageNumber}:`, error);
      return {
        pageNumber: image.pageNumber,
        text: '',
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }
  }

  async processImages(images: PageImage[]): Promise<OCRResult[]> {
    const results: OCRResult[] = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const result = await this.processImage(image);
      results.push(result);

      // Small delay to avoid rate limiting
      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return results;
  }

  async processImagesBatch(images: PageImage[]): Promise<OCRResult[]> {
    if (!this.initialized) {
      throw new Error('Google Vision not initialized. Call initialize() first.');
    }

    // For REST API, process one at a time (batch API has different limits)
    if (this.useRestApi) {
      return this.processImages(images);
    }

    if (!this.client) {
      throw new Error('Google Vision client not available.');
    }

    const results: OCRResult[] = [];
    const batchSize = 16; // Google Vision limit

    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);

      const requests = batch.map(image => ({
        image: { content: image.buffer.toString('base64') },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: {
          languageHints: this.languages,
        },
      }));

      const startTime = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [response] = await (this.client as any).batchAnnotateImages({ requests });
      const processingTime = Date.now() - startTime;

      for (let j = 0; j < batch.length; j++) {
        const imageResponse = response.responses[j] as AnnotateImageResponse;
        const image = batch[j];

        if (imageResponse.error) {
          console.error(`Error on page ${image.pageNumber}:`, imageResponse.error.message);
          results.push({
            pageNumber: image.pageNumber,
            text: '',
            confidence: 0,
            processingTime: processingTime / batch.length,
          });
        } else {
          results.push({
            pageNumber: image.pageNumber,
            text: imageResponse.fullTextAnnotation?.text || '',
            confidence:
              (imageResponse.fullTextAnnotation?.pages?.[0]?.confidence ?? 0.9) * 100,
            processingTime: processingTime / batch.length,
          });
        }
      }
    }

    return results;
  }

  setLanguages(languages: string[]): void {
    this.languages = languages;
  }
}

// Singleton instance for reuse
let visionInstance: GoogleVisionOCR | null = null;

export async function getVisionClient(languages: string[] = ['en']): Promise<GoogleVisionOCR> {
  if (!visionInstance) {
    visionInstance = new GoogleVisionOCR({ languages });
    await visionInstance.initialize();
  } else {
    visionInstance.setLanguages(languages);
  }
  return visionInstance;
}
