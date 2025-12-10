import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
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
  const subscriptionId = session.subscription as string;

  if (!userId) {
    console.error('No userId in checkout session metadata');
    return;
  }

  // Get subscription details to determine tier
  const stripe = (await import('@/lib/stripe')).stripe;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;
  const tier = priceId ? getTierFromPriceId(priceId) : 'basic';

  // Calculate period end
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  // Upsert subscription record
  await prisma.subscription.upsert({
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
  });

  console.log(`Subscription created for user ${userId}: ${tier}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  const { tier, status } = mapSubscriptionStatusToTier(subscription);

  // Try to find subscription by Stripe subscription ID
  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubId: subscription.id },
  });

  if (!existingSub && !userId) {
    console.error('Cannot find subscription to update');
    return;
  }

  const targetUserId = existingSub?.userId || userId;
  if (!targetUserId) return;

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  await prisma.subscription.update({
    where: { userId: targetUserId },
    data: {
      tier,
      status,
      currentPeriodEnd: periodEnd,
      // Reset usage on renewal
      ...(subscription.current_period_start && {
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        pagesUsedThisPeriod: 0,
        exportsUsedThisPeriod: 0,
      }),
    },
  });

  console.log(`Subscription updated for user ${targetUserId}: ${tier} (${status})`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Find subscription by Stripe subscription ID
  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubId: subscription.id },
  });

  if (!existingSub) {
    console.error('Cannot find subscription to delete');
    return;
  }

  // Downgrade to free tier
  await prisma.subscription.update({
    where: { userId: existingSub.userId },
    data: {
      tier: 'free',
      status: 'canceled',
      stripeSubId: null,
    },
  });

  console.log(`Subscription canceled for user ${existingSub.userId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) return;

  // Find subscription by Stripe subscription ID
  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubId: subscriptionId },
  });

  if (!existingSub) {
    console.error('Cannot find subscription for failed payment');
    return;
  }

  // Mark as past due
  await prisma.subscription.update({
    where: { userId: existingSub.userId },
    data: {
      status: 'past_due',
    },
  });

  console.log(`Payment failed for user ${existingSub.userId}`);
}
