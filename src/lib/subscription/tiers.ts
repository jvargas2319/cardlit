/**
 * Subscription tier definitions
 * Defines page limits, export limits, and pricing for each tier
 */

export const TIERS = {
  free: {
    name: 'Free',
    pageLimit: 50,
    exportLimit: 0,
    exportStorageDays: 0,
    price: 0,
    priceId: null,
    description: 'Perfect for trying out the service',
    billingPeriod: 'month',
    features: [
      '50 pages per month',
      'PDF & image support',
      'Anki & Excel CSV export',
      'Printable flashcards',
    ],
  },
  basic: {
    name: 'Basic',
    pageLimit: 50,
    exportLimit: 5,
    exportStorageDays: 30,
    price: 9,
    priceId: process.env.STRIPE_PRICE_BASIC || null,
    description: 'Great for students',
    billingPeriod: 'month',
    features: [
      '50 pages per month',
      'Everything in Free',
      'Save 5 exports per month',
      '30-day export storage',
    ],
  },
  pro: {
    name: 'Pro',
    pageLimit: 500,
    exportLimit: 30,
    exportStorageDays: 90,
    price: 19,
    priceId: process.env.STRIPE_PRICE_PRO || null,
    description: 'For power users',
    billingPeriod: 'month',
    features: [
      '500 pages per month',
      'Everything in Basic',
      'Save 30 exports per month',
      '90-day export storage',
      'Priority processing',
    ],
  },
  unlimited: {
    name: 'Unlimited',
    pageLimit: Infinity,
    exportLimit: Infinity,
    exportStorageDays: Infinity,
    price: 59,
    priceId: process.env.STRIPE_PRICE_UNLIMITED || null,
    description: 'No limits, no worries',
    billingPeriod: 'year',
    features: [
      'Unlimited pages',
      'Everything in Pro',
      'Unlimited saved exports',
      'Exports never expire',
      'Priority processing',
    ],
  },
} as const;

export type TierName = keyof typeof TIERS;

export function getTierLimit(tier: TierName): number {
  return TIERS[tier].pageLimit;
}

export function getExportLimit(tier: TierName): number {
  return TIERS[tier].exportLimit;
}

export function getExportStorageDays(tier: TierName): number {
  return TIERS[tier].exportStorageDays;
}

export function getTierInfo(tier: TierName) {
  return TIERS[tier];
}

export function getTierPrice(tier: TierName): number {
  return TIERS[tier].price;
}

export function getTierPriceId(tier: TierName): string | null {
  return TIERS[tier].priceId;
}

export function isValidTier(tier: string): tier is TierName {
  return tier in TIERS;
}

export function canSaveExports(tier: TierName): boolean {
  return TIERS[tier].exportLimit > 0;
}

export function getAllTiers() {
  return Object.entries(TIERS).map(([key, value]) => ({
    id: key as TierName,
    ...value,
  }));
}
