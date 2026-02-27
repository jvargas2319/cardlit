import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma, withRetry } from '@/lib/db';
import { createPortalSession } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUser();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user's subscription with Stripe customer ID
    const subscription = await withRetry(() => prisma.subscription.findUnique({
      where: { userId },
    }));

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json(
        { success: false, error: 'No active subscription found' },
        { status: 400 }
      );
    }

    // Build return URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'http://localhost:3000';
    const returnUrl = `${baseUrl}/upload`;

    // Create portal session
    const session = await createPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl,
    });

    return NextResponse.json({
      success: true,
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    console.error('Portal session error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
