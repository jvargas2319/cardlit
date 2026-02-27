/**
 * OpenRouter API Client for vocabulary extraction
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
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

interface OpenRouterConfig {
  apiKey: string;
  model: string;
  fallbackModel?: string;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
}

const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct';

const DEFAULT_CONFIG: Partial<OpenRouterConfig> = {
  model: process.env.OPENROUTER_EXTRACTION_MODEL || DEFAULT_MODEL,
  fallbackModel: process.env.OPENROUTER_FALLBACK_MODEL || undefined,
  maxRetries: 5,
  retryDelayMs: 3000,
  timeoutMs: 120000,
};

export class OpenRouterError extends Error {
  constructor(public status: number, message: string) {
    super(`OpenRouter API Error (${status}): ${message}`);
    this.name = 'OpenRouterError';
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export class OpenRouterClient {
  private config: OpenRouterConfig;
  private lastRequestTime = 0;

  constructor(apiKey?: string, config: Partial<OpenRouterConfig> = {}) {
    const envKey = process.env.OPENROUTER_API_KEY;
    const key = apiKey || (envKey && envKey.trim() ? envKey : undefined);
    if (!key) {
      throw new Error('OpenRouter API key is required. Please set OPENROUTER_API_KEY in your .env file.');
    }

    this.config = {
      apiKey: key,
      ...DEFAULT_CONFIG,
      ...config,
    } as OpenRouterConfig;

    console.log(`[OpenRouter] Using extraction model: ${this.config.model}${this.config.fallbackModel ? `, fallback: ${this.config.fallbackModel}` : ''}`);
  }

  async chat(messages: ChatMessage[], temperature = 0.1): Promise<string> {
    await this.enforceRateLimit();

    try {
      const response = await this.makeRequest(messages, temperature, this.config.model);

      if (!response.choices || response.choices.length === 0) {
        console.error('OpenRouter returned no choices:', response);
        throw new Error('OpenRouter API returned empty response');
      }

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      if (this.config.fallbackModel && error instanceof OpenRouterError && error.isRateLimited) {
        console.log(`[OpenRouter] Primary model rate-limited, trying fallback: ${this.config.fallbackModel}`);
        const response = await this.makeRequest(messages, temperature, this.config.fallbackModel);

        if (!response.choices || response.choices.length === 0) {
          throw new Error('OpenRouter fallback model returned empty response');
        }

        return response.choices[0]?.message?.content || '';
      }
      throw error;
    }
  }

  private async makeRequest(
    messages: ChatMessage[],
    temperature: number,
    model: string,
    attempt = 1
  ): Promise<OpenRouterResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://cardlit.com',
          'X-Title': 'Cardlit',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const err = new OpenRouterError(response.status, errorText);

        if (err.isRateLimited) {
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            (err as OpenRouterError & { retryAfterMs?: number }).retryAfterMs = parseInt(retryAfter, 10) * 1000;
          }
        }

        throw err;
      }

      this.lastRequestTime = Date.now();

      return await response.json();
    } catch (error) {
      if (this.shouldRetry(error, attempt)) {
        const jitter = Math.random() * 1000;
        let delay = this.config.retryDelayMs * Math.pow(2, attempt - 1) + jitter;

        const retryAfterMs = (error as { retryAfterMs?: number })?.retryAfterMs;
        if (retryAfterMs && retryAfterMs > delay) {
          delay = retryAfterMs + jitter;
        }

        console.log(`[OpenRouter] Retrying request (attempt ${attempt + 1}/${this.config.maxRetries}) after ${Math.round(delay)}ms...`);
        await this.delay(delay);
        return this.makeRequest(messages, temperature, model, attempt + 1);
      }
      throw error;
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const minIntervalMs = 500;
    const elapsed = Date.now() - this.lastRequestTime;

    if (elapsed < minIntervalMs) {
      await this.delay(minIntervalMs - elapsed);
    }
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.config.maxRetries) return false;

    if (error instanceof OpenRouterError) {
      return error.status === 429 || error.status >= 500;
    }

    return error instanceof TypeError ||
           (error as { name?: string })?.name === 'AbortError';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

let clientInstance: OpenRouterClient | null = null;

export function getOpenRouterClient(): OpenRouterClient {
  if (!clientInstance) {
    clientInstance = new OpenRouterClient();
  }
  return clientInstance;
}
