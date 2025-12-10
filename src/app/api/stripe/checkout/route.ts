import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createCheckoutSession, getPriceIdForTier } from '@/lib/stripe';
import { isValidTier, TierName } from '@/lib/subscription/tiers';

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUser();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { tier } = body as { tier: string };

    // Validate tier
    if (!tier || !isValidTier(tier) || tier === 'free') {
      return NextResponse.json(
        { success: false, error: 'Invalid tier' },
        { status: 400 }
      );
    }

    const priceId = getPriceIdForTier(tier as TierName);
    if (!priceId) {
      return NextResponse.json(
        { success: false, error: 'Stripe price not configured for this tier' },
        { status: 400 }
      );
    }

    // Get user and their existing subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Build success and cancel URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'http://localhost:3000';
    const successUrl = `${baseUrl}/upload?subscription=success`;
    const cancelUrl = `${baseUrl}/pricing?subscription=canceled`;

    // Create checkout session
    const session = await createCheckoutSession({
      userId: user.id,
      userEmail: user.email,
      priceId,
      successUrl,
      cancelUrl,
      customerId: user.subscription?.stripeCustomerId || undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error('Checkout session error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
