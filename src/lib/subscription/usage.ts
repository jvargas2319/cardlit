/**
 * Subscription usage tracking functions
 * Handles page limit checking and usage recording
 */

import { prisma, withRetry } from '@/lib/db';
import { getTierLimit, getAllowedFileTypes, getMaxFilesPerUpload, canUploadPdf as tierCanUploadPdf, type TierName, isValidTier } from './tiers';

export interface Usage {
  tier: TierName;
  tierName: string;
  pagesUsed: number;
  pageLimit: number;
  pagesRemaining: number;
  percentUsed: number;
  periodEnd?: Date;
  allowedFileTypes: 'images_only' | 'all';
  maxFilesPerUpload: number;
  canUploadPdf: boolean;
}

export interface LimitCheck {
  allowed: boolean;
  remaining: number;
  requested: number;
  tier: TierName;
  wouldExceedBy: number;
  message?: string;
}

/**
 * Get user's current usage stats
 */
export async function getUserUsage(userId: string): Promise<Usage> {
  const sub = await withRetry(() => prisma.subscription.findUnique({
    where: { userId },
  }));

  if (!sub) {
    return {
      tier: 'trial',
      tierName: 'No Plan',
      pagesUsed: 0,
      pageLimit: 0,
      pagesRemaining: 0,
      percentUsed: 0,
      allowedFileTypes: getAllowedFileTypes('trial'),
      maxFilesPerUpload: getMaxFilesPerUpload('trial'),
      canUploadPdf: tierCanUploadPdf('trial'),
    };
  }

  const tier = isValidTier(sub.tier) ? sub.tier : 'trial';

  // Check if trial has expired
  if (tier === 'trial' && sub.currentPeriodEnd && new Date() > sub.currentPeriodEnd) {
    return {
      tier: 'trial',
      tierName: 'Trial (Expired)',
      pagesUsed: sub.pagesUsedThisPeriod,
      pageLimit: 0,
      pagesRemaining: 0,
      percentUsed: 100,
      periodEnd: sub.currentPeriodEnd,
      allowedFileTypes: getAllowedFileTypes('trial'),
      maxFilesPerUpload: getMaxFilesPerUpload('trial'),
      canUploadPdf: tierCanUploadPdf('trial'),
    };
  }

  const pageLimit = getTierLimit(tier);
  const pagesUsed = sub.pagesUsedThisPeriod;
  const pagesRemaining = pageLimit === Infinity ? Infinity : Math.max(0, pageLimit - pagesUsed);
  const percentUsed = pageLimit === Infinity ? 0 : Math.round((pagesUsed / pageLimit) * 100);

  return {
    tier,
    tierName: tier.charAt(0).toUpperCase() + tier.slice(1),
    pagesUsed,
    pageLimit,
    pagesRemaining,
    percentUsed,
    periodEnd: sub.currentPeriodEnd ?? undefined,
    allowedFileTypes: getAllowedFileTypes(tier),
    maxFilesPerUpload: getMaxFilesPerUpload(tier),
    canUploadPdf: tierCanUploadPdf(tier),
  };
}

/**
 * Check if user can process a given number of pages
 */
export async function canProcessPages(userId: string, pageCount: number): Promise<LimitCheck> {
  const usage = await getUserUsage(userId);
  const remaining = usage.pagesRemaining;
  const allowed = remaining === Infinity || pageCount <= remaining;
  const wouldExceedBy = remaining === Infinity ? 0 : Math.max(0, pageCount - remaining);

  let message: string | undefined;
  if (!allowed) {
    if (usage.tier === 'trial' && usage.pageLimit === 0) {
      message = 'Your trial has expired. Please upgrade to continue processing files.';
    } else {
      message = `Your ${usage.tierName} plan has ${remaining} pages remaining. This document has ${pageCount} pages.`;
    }
  }

  return {
    allowed,
    remaining: remaining === Infinity ? Infinity : remaining,
    requested: pageCount,
    tier: usage.tier,
    wouldExceedBy,
    message,
  };
}

/**
 * Record page usage for a user
 * Creates subscription record if it doesn't exist
 */
export async function recordPageUsage(userId: string, pageCount: number): Promise<void> {
  await withRetry(() => prisma.subscription.upsert({
    where: { userId },
    update: {
      pagesUsedThisPeriod: {
        increment: pageCount,
      },
    },
    create: {
      userId,
      tier: 'trial',
      pagesUsedThisPeriod: pageCount,
    },
  }));
}

/**
 * Reset monthly usage (for cron job)
 */
export async function resetMonthlyUsage(): Promise<number> {
  const result = await withRetry(() => prisma.subscription.updateMany({
    where: {
      status: 'active',
    },
    data: {
      pagesUsedThisPeriod: 0,
      currentPeriodStart: new Date(),
    },
  }));

  return result.count;
}
