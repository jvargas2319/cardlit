/**
 * Export saving limits and usage tracking
 */

import { prisma, withRetry } from '@/lib/db';
import { getExportLimit, getExportStorageDays, isValidTier, TierName, canSaveExports } from './tiers';

export interface ExportUsageResult {
  tier: TierName;
  tierName: string;
  exportsUsed: number;
  exportLimit: number;
  exportsRemaining: number;
  canSave: boolean;
  storageDays: number;
}

/**
 * Get user's export usage for the current period
 */
export async function getExportUsage(userId: string): Promise<ExportUsageResult> {
  const subscription = await withRetry(() => prisma.subscription.findUnique({
    where: { userId },
  }));

  const tier: TierName = subscription?.tier && isValidTier(subscription.tier)
    ? subscription.tier as TierName
    : 'free';

  const exportLimit = getExportLimit(tier);
  const exportsUsed = subscription?.exportsUsedThisPeriod || 0;
  const exportsRemaining = Math.max(0, exportLimit - exportsUsed);
  const storageDays = getExportStorageDays(tier);

  return {
    tier,
    tierName: tier.charAt(0).toUpperCase() + tier.slice(1),
    exportsUsed,
    exportLimit: exportLimit === Infinity ? -1 : exportLimit, // -1 indicates unlimited
    exportsRemaining: exportLimit === Infinity ? -1 : exportsRemaining,
    canSave: canSaveExports(tier) && (exportLimit === Infinity || exportsRemaining > 0),
    storageDays: storageDays === Infinity ? -1 : storageDays,
  };
}

/**
 * Check if user can save an export
 */
export async function canUserSaveExport(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  usage: ExportUsageResult;
}> {
  const usage = await getExportUsage(userId);

  if (!canSaveExports(usage.tier)) {
    return {
      allowed: false,
      reason: 'Upgrade to Basic or higher to save exports to your account',
      usage,
    };
  }

  if (usage.exportLimit !== -1 && usage.exportsRemaining <= 0) {
    return {
      allowed: false,
      reason: `You've reached your monthly limit of ${usage.exportLimit} saved exports`,
      usage,
    };
  }

  return {
    allowed: true,
    usage,
  };
}

/**
 * Record that an export was saved (increment counter)
 */
export async function recordExportSaved(userId: string): Promise<void> {
  await withRetry(() => prisma.subscription.upsert({
    where: { userId },
    update: {
      exportsUsedThisPeriod: { increment: 1 },
    },
    create: {
      userId,
      tier: 'free',
      exportsUsedThisPeriod: 1,
    },
  }));
}

/**
 * Calculate expiration date for a saved export based on tier
 */
export function calculateExpirationDate(tier: TierName): Date | null {
  const storageDays = getExportStorageDays(tier);

  if (storageDays === Infinity) {
    return null; // Never expires
  }

  if (storageDays === 0) {
    // Shouldn't happen (free users can't save), but handle it
    return new Date();
  }

  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + storageDays);
  return expirationDate;
}

/**
 * Reset monthly export usage for all subscriptions
 * Called by cron job at the start of each billing period
 */
export async function resetMonthlyExportUsage(): Promise<number> {
  const result = await withRetry(() => prisma.subscription.updateMany({
    where: {
      status: 'active',
    },
    data: {
      exportsUsedThisPeriod: 0,
    },
  }));

  return result.count;
}
