import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma, withRetry } from '@/lib/db';
import { constructWebhookEvent, getTierFromPriceId, mapSubscriptionStatusToTier } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Stripe webhook secret not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const body = await request.text();
    event = constructWebhookEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const customerId = session.customer as string;

  if (!userId) {
    console.error('No userId in checkout session metadata');
    return;
  }

  // One-time payment (trial) vs subscription
  if (session.mode === 'payment') {
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await withRetry(() => prisma.subscription.upsert({
      where: { userId },
      update: {
        tier: 'trial',
        stripeCustomerId: customerId,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEnd,
        pagesUsedThisPeriod: 0,
        exportsUsedThisPeriod: 0,
      },
      create: {
        userId,
        tier: 'trial',
        stripeCustomerId: customerId,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEnd,
        pagesUsedThisPeriod: 0,
        exportsUsedThisPeriod: 0,
      },
    }));

    console.log(`Trial activated for user ${userId} (expires ${trialEnd.toISOString()})`);
    return;
  }

  const subscriptionId = session.subscription as string;

  // Get subscription details to determine tier
  const stripe = (await import('@/lib/stripe')).stripe;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;
  const tier = priceId ? getTierFromPriceId(priceId) : 'basic';

  const subData = subscription as unknown as { current_period_end?: number; currentPeriodEnd?: number };
  const periodEndTimestamp = subData.current_period_end || subData.currentPeriodEnd;
  const periodEnd = periodEndTimestamp
    ? new Date(periodEndTimestamp * 1000)
    : null;

  await withRetry(() => prisma.subscription.upsert({
    where: { userId },
    update: {
      tier: tier || 'basic',
      stripeCustomerId: customerId,
      stripeSubId: subscriptionId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      pagesUsedThisPeriod: 0,
      exportsUsedThisPeriod: 0,
    },
    create: {
      userId,
      tier: tier || 'basic',
      stripeCustomerId: customerId,
      stripeSubId: subscriptionId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      pagesUsedThisPeriod: 0,
      exportsUsedThisPeriod: 0,
    },
  }));

  console.log(`Subscription created for user ${userId}: ${tier}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  const { tier, status } = mapSubscriptionStatusToTier(subscription);

  // Try to find subscription by Stripe subscription ID
  const existingSub = await withRetry(() => prisma.subscription.findUnique({
    where: { stripeSubId: subscription.id },
  }));

  if (!existingSub && !userId) {
    console.error('Cannot find subscription to update');
    return;
  }

  const targetUserId = existingSub?.userId || userId;
  if (!targetUserId) return;

  // Cast to handle Stripe SDK version differences
  const subData = subscription as unknown as {
    current_period_end?: number;
    currentPeriodEnd?: number;
    current_period_start?: number;
    currentPeriodStart?: number;
  };
  const periodEndTimestamp = subData.current_period_end || subData.currentPeriodEnd;
  const periodStartTimestamp = subData.current_period_start || subData.currentPeriodStart;

  const periodEnd = periodEndTimestamp
    ? new Date(periodEndTimestamp * 1000)
    : null;

  await withRetry(() => prisma.subscription.update({
    where: { userId: targetUserId },
    data: {
      tier,
      status,
      currentPeriodEnd: periodEnd,
      // Reset usage on renewal
      ...(periodStartTimestamp && {
        currentPeriodStart: new Date(periodStartTimestamp * 1000),
        pagesUsedThisPeriod: 0,
        exportsUsedThisPeriod: 0,
      }),
    },
  }));

  console.log(`Subscription updated for user ${targetUserId}: ${tier} (${status})`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Find subscription by Stripe subscription ID
  const existingSub = await withRetry(() => prisma.subscription.findUnique({
    where: { stripeSubId: subscription.id },
  }));

  if (!existingSub) {
    console.error('Cannot find subscription to delete');
    return;
  }

  await withRetry(() => prisma.subscription.update({
    where: { userId: existingSub.userId },
    data: {
      tier: 'trial',
      status: 'canceled',
      stripeSubId: null,
    },
  }));

  console.log(`Subscription canceled for user ${existingSub.userId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Cast to handle Stripe SDK version differences
  const invoiceData = invoice as unknown as { subscription?: string };
  const subscriptionId = invoiceData.subscription;

  if (!subscriptionId) return;

  // Find subscription by Stripe subscription ID
  const existingSub = await withRetry(() => prisma.subscription.findUnique({
    where: { stripeSubId: subscriptionId },
  }));

  if (!existingSub) {
    console.error('Cannot find subscription for failed payment');
    return;
  }

  // Mark as past due
  await withRetry(() => prisma.subscription.update({
    where: { userId: existingSub.userId },
    data: {
      status: 'past_due',
    },
  }));

  console.log(`Payment failed for user ${existingSub.userId}`);
}
