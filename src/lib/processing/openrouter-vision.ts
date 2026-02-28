/**
 * OpenRouter Vision OCR Engine
 * Uses free vision models from OpenRouter for OCR text extraction
 * Replaces Google Cloud Vision to avoid billing requirements
 */

import type { PageImage, OCRResult } from '@/types';

interface OpenRouterVisionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenRouterVisionConfig {
  apiKey: string;
  model: string;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: Partial<OpenRouterVisionConfig> = {
  // Qwen 2.5 VL 32B vision model on OpenRouter
  // Excellent for OCR and text extraction from images
  model: 'qwen/qwen2.5-vl-32b-instruct',
  maxRetries: 6,
  retryDelayMs: 2000,
  timeoutMs: 120000,
};

// OCR prompt optimized for text extraction
const OCR_SYSTEM_PROMPT = `You are an OCR (Optical Character Recognition) system. Your task is to extract ALL text from the provided image exactly as it appears.

Rules:
1. Extract ALL visible text, including headers, body text, footnotes, captions, etc.
2. Preserve the original language - do NOT translate
3. Maintain paragraph structure with line breaks
4. For multilingual text (e.g., Arabic with English), extract both languages
5. Do NOT add any commentary, explanations, or formatting markers
6. Do NOT describe the image - ONLY output the extracted text
7. If the image contains a table, extract the text row by row
8. Preserve any special characters, numbers, and punctuation exactly as shown

Output ONLY the extracted text, nothing else.`;

export class OpenRouterVisionOCR {
  private config: OpenRouterVisionConfig;
  private initialized = false;
  private lastRequestTime = 0;
  private languages: string[];

  constructor(options: { languages?: string[] } = {}) {
    this.languages = options.languages || ['ar', 'en'];
    
    const envKey = process.env.OPENROUTER_API_KEY;
    const key = envKey && envKey.trim() ? envKey : undefined;
    
    if (!key) {
      throw new Error('OpenRouter API key is required. Please set OPENROUTER_API_KEY in your .env file.');
    }

    this.config = {
      apiKey: key,
      ...DEFAULT_CONFIG,
    } as OpenRouterVisionConfig;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Verify API key is valid by checking it exists
    if (!this.config.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }
    
    this.initialized = true;
    console.log(`OpenRouter Vision initialized with model: ${this.config.model}`);
  }

  private async enforceRateLimit(): Promise<void> {
    // Enforce minimum 2 seconds between requests for free tier
    const minIntervalMs = 2000;
    const elapsed = Date.now() - this.lastRequestTime;

    if (elapsed < minIntervalMs) {
      await this.delay(minIntervalMs - elapsed);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getImageMimeType(buffer: Buffer): string {
    // Check magic bytes to determine image type
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      return 'image/jpeg';
    } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'image/png';
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'image/gif';
    } else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return 'image/webp';
    }
    // Default to PNG
    return 'image/png';
  }

  private async makeVisionRequest(
    imageBuffer: Buffer,
    attempt = 1
  ): Promise<string> {
    try {
      await this.enforceRateLimit();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getImageMimeType(imageBuffer);
      const dataUrl = `data:${mimeType};base64,${base64Image}`;

      // Build the prompt with language hints
      const languageHint = this.languages.length > 0 
        ? `The image may contain text in these languages: ${this.languages.join(', ')}. Extract all text in its original language.`
        : '';

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://cardlit.com',
          'X-Title': 'Cardlit OCR',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `${OCR_SYSTEM_PROMPT}\n\n${languageHint}`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 4096,
          temperature: 0.1, // Low temperature for accurate extraction
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter Vision API error (${response.status}): ${errorText}`);
      }

      this.lastRequestTime = Date.now();

      const data = (await response.json()) as OpenRouterVisionResponse;

      if (!data.choices || data.choices.length === 0) {
        throw new Error('OpenRouter returned no choices');
      }

      return data.choices[0]?.message?.content || '';
    } catch (error) {
      if (this.shouldRetry(error, attempt)) {
        const errorMessage = error instanceof Error ? error.message : '';
        const isRateLimit = errorMessage.includes('429');
        const baseDelay = isRateLimit ? 15000 : this.config.retryDelayMs;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`Retrying OpenRouter Vision request (attempt ${attempt + 1}/${this.config.maxRetries}) after ${delay}ms${isRateLimit ? ' (rate limited)' : ''}...`);
        await this.delay(delay);
        return this.makeVisionRequest(imageBuffer, attempt + 1);
      }
      throw error;
    }
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.config.maxRetries) return false;

    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Retry on rate limit (429) and server errors (5xx)
    if (errorMessage.includes('429') || errorMessage.includes('500') || 
        errorMessage.includes('502') || errorMessage.includes('503')) {
      return true;
    }

    // Retry on network errors
    return error instanceof TypeError ||
           (error as { name?: string })?.name === 'AbortError';
  }

  async processImage(image: PageImage): Promise<OCRResult> {
    if (!this.initialized) {
      throw new Error('OpenRouter Vision not initialized. Call initialize() first.');
    }

    const startTime = Date.now();

    try {
      const text = await this.makeVisionRequest(image.buffer);
      
      return {
        pageNumber: image.pageNumber,
        text: text.trim(),
        confidence: 85, // OpenRouter doesn't provide confidence, use reasonable default
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

      // Rate limiting is handled in makeVisionRequest
    }

    return results;
  }

  async processImagesBatch(images: PageImage[]): Promise<OCRResult[]> {
    if (!this.initialized) {
      throw new Error('OpenRouter Vision not initialized. Call initialize() first.');
    }

    // OpenRouter doesn't support true batch processing for vision,
    // so we process sequentially with rate limiting
    return this.processImages(images);
  }

  setLanguages(languages: string[]): void {
    this.languages = languages;
  }
}

// Singleton instance for reuse
let visionInstance: OpenRouterVisionOCR | null = null;

export async function getVisionClient(languages: string[] = ['ar', 'en']): Promise<OpenRouterVisionOCR> {
  if (!visionInstance) {
    visionInstance = new OpenRouterVisionOCR({ languages });
    await visionInstance.initialize();
  } else {
    visionInstance.setLanguages(languages);
  }
  return visionInstance;
}

