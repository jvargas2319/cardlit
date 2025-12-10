/**
 * Subscription usage tracking functions
 * Handles page limit checking and usage recording
 */

import { prisma } from '@/lib/db';
import { getTierLimit, type TierName, isValidTier } from './tiers';

export interface Usage {
  tier: TierName;
  tierName: string;
  pagesUsed: number;
  pageLimit: number;
  pagesRemaining: number;
  percentUsed: number;
  periodEnd?: Date;
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
  const sub = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!sub) {
    // User has no subscription - they're on free tier
    return {
      tier: 'free',
      tierName: 'Free',
      pagesUsed: 0,
      pageLimit: 50,
      pagesRemaining: 50,
      percentUsed: 0,
    };
  }

  const tier = isValidTier(sub.tier) ? sub.tier : 'free';
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
    message = `Your ${usage.tierName} plan has ${remaining} pages remaining this month. This document has ${pageCount} pages.`;
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
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      pagesUsedThisPeriod: {
        increment: pageCount,
      },
    },
    create: {
      userId,
      tier: 'free',
      pagesUsedThisPeriod: pageCount,
    },
  });
}

/**
 * Reset monthly usage (for cron job)
 */
export async function resetMonthlyUsage(): Promise<number> {
  const result = await prisma.subscription.updateMany({
    where: {
      status: 'active',
    },
    data: {
      pagesUsedThisPeriod: 0,
      currentPeriodStart: new Date(),
    },
  });

  return result.count;
}
