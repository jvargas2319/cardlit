/**
 * Subscription tier definitions
 * Defines page limits, export limits, and pricing for each tier
 */

export const TIERS = {
  trial: {
    name: 'Trial',
    pageLimit: 10,
    exportLimit: 0,
    exportStorageDays: 0,
    allowedFileTypes: 'images_only' as const,
    maxFilesPerUpload: 3,
    price: 2,
    priceId: process.env.STRIPE_PRICE_TRIAL || null,
    description: 'Try it out for 7 days',
    billingPeriod: '7 days',
    features: [
      '10 pages',
      'Up to 3 images per upload',
      'Anki & Excel CSV export',
      'Printable flashcards',
    ],
  },
  basic: {
    name: 'Basic',
    pageLimit: 50,
    exportLimit: 5,
    exportStorageDays: 30,
    allowedFileTypes: 'images_only' as const,
    maxFilesPerUpload: 3,
    price: 9,
    priceId: process.env.STRIPE_PRICE_BASIC || null,
    description: 'Great for students',
    billingPeriod: 'month',
    features: [
      '50 pages per month',
      'Images & screenshots only',
      'Up to 3 images per upload',
      'Save 5 exports per month',
      '30-day export storage',
    ],
  },
  pro: {
    name: 'Pro',
    pageLimit: 500,
    exportLimit: 30,
    exportStorageDays: 90,
    allowedFileTypes: 'all' as const,
    maxFilesPerUpload: 10,
    price: 19,
    priceId: process.env.STRIPE_PRICE_PRO || null,
    description: 'For power users',
    billingPeriod: 'month',
    features: [
      '500 pages per month',
      'PDF & image support',
      'Up to 10 files per upload',
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
    allowedFileTypes: 'all' as const,
    maxFilesPerUpload: 20,
    price: 59,
    priceId: process.env.STRIPE_PRICE_UNLIMITED || null,
    description: 'No limits, no worries',
    billingPeriod: 'year',
    features: [
      'Unlimited pages',
      'PDF & image support',
      'Up to 20 files per upload',
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

export function getAllowedFileTypes(tier: TierName): 'images_only' | 'all' {
  return TIERS[tier].allowedFileTypes;
}

export function getMaxFilesPerUpload(tier: TierName): number {
  return TIERS[tier].maxFilesPerUpload;
}

export function canUploadPdf(tier: TierName): boolean {
  return TIERS[tier].allowedFileTypes === 'all';
}

export function getAllTiers() {
  return Object.entries(TIERS).map(([key, value]) => ({
    id: key as TierName,
    ...value,
  }));
}
