import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Execute a Prisma operation with automatic retry on connection errors.
 * Neon's serverless Postgres (PgBouncer) drops idle connections aggressively,
 * so long-running jobs (OCR batches) can hit stale connections.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isConnectionError =
        message.includes('Closed') ||
        message.includes('connection') ||
        message.includes('connect') ||
        message.includes('ECONNRESET') ||
        message.includes('ECONNREFUSED') ||
        message.includes('socket hang up') ||
        message.includes('Connection terminated') ||
        message.includes('prepared statement');

      if (isConnectionError && attempt < maxRetries) {
        console.warn(
          `[Prisma] Connection error (attempt ${attempt + 1}/${maxRetries + 1}): ${message}. Retrying in ${delayMs}ms...`
        );
        // Disconnect and let Prisma re-establish on next query
        try {
          await prisma.$disconnect();
        } catch {
          // ignore disconnect errors
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
