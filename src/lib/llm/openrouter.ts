/**
 * OpenRouter API Client
 * Integrates with Llama 3.1 8B for vocabulary extraction
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
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: Partial<OpenRouterConfig> = {
  model: 'meta-llama/llama-3.3-70b-instruct:free',
  maxRetries: 3,
  retryDelayMs: 2000,
  timeoutMs: 120000,
};

class OpenRouterError extends Error {
  constructor(public status: number, message: string) {
    super(`OpenRouter API Error (${status}): ${message}`);
    this.name = 'OpenRouterError';
  }
}

export class OpenRouterClient {
  private config: OpenRouterConfig;
  private lastRequestTime = 0;

  constructor(apiKey?: string, config: Partial<OpenRouterConfig> = {}) {
    // Check for both undefined and empty string (system env might have empty value)
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
  }

  async chat(messages: ChatMessage[], temperature = 0.1): Promise<string> {
    await this.enforceRateLimit();

    const response = await this.makeRequest(messages, temperature);

    if (!response.choices || response.choices.length === 0) {
      console.error('OpenRouter returned no choices:', response);
      throw new Error('OpenRouter API returned empty response');
    }

    const content = response.choices[0]?.message?.content || '';
    return content;
  }

  private async makeRequest(
    messages: ChatMessage[],
    temperature: number,
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
          model: this.config.model,
          messages,
          temperature,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new OpenRouterError(response.status, errorText);
      }

      this.lastRequestTime = Date.now();

      return await response.json();
    } catch (error) {
      if (this.shouldRetry(error, attempt)) {
        const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
        console.log(`Retrying OpenRouter request (attempt ${attempt + 1}) after ${delay}ms...`);
        await this.delay(delay);
        return this.makeRequest(messages, temperature, attempt + 1);
      }
      throw error;
    }
  }

  private async enforceRateLimit(): Promise<void> {
    // Enforce minimum 2 seconds between requests for free tier
    const minIntervalMs = 2000;
    const elapsed = Date.now() - this.lastRequestTime;

    if (elapsed < minIntervalMs) {
      await this.delay(minIntervalMs - elapsed);
    }
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.config.maxRetries) return false;

    if (error instanceof OpenRouterError) {
      // Retry on rate limit (429) and server errors (5xx)
      return error.status === 429 || error.status >= 500;
    }

    // Retry on network errors
    return error instanceof TypeError ||
           (error as { name?: string })?.name === 'AbortError';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let clientInstance: OpenRouterClient | null = null;

export function getOpenRouterClient(): OpenRouterClient {
  if (!clientInstance) {
    clientInstance = new OpenRouterClient();
  }
  return clientInstance;
}
