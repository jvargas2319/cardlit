import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUserUsage } from '@/lib/subscription/usage';

export const runtime = 'nodejs';

/**
 * Get current user's subscription usage
 * GET /api/subscription/usage
 * Returns: { tier, tierName, pagesUsed, pageLimit, pagesRemaining, percentUsed, periodEnd }
 */
export async function GET() {
  try {
    const userId = await getAuthUser();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const usage = await getUserUsage(userId);

    return NextResponse.json({
      success: true,
      data: usage,
    });
  } catch (error) {
    console.error('Get usage error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get usage' },
      { status: 500 }
    );
  }
}
