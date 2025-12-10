'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TIERS, TierName } from '@/lib/subscription/tiers';

export default function PricingPage() {
  const router = useRouter();
  const [currentTier, setCurrentTier] = useState<TierName | null>(null);
  const [loading, setLoading] = useState<TierName | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user is logged in and get their current tier
    fetch('/api/subscription/usage')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setCurrentTier(data.data.tier as TierName);
          setIsLoggedIn(true);
        }
      })
      .catch(() => {
        // Not logged in
        setIsLoggedIn(false);
      });
  }, []);

  const handleSubscribe = async (tier: TierName) => {
    if (!isLoggedIn) {
      router.push('/register');
      return;
    }

    if (tier === 'free' || tier === currentTier) {
      return;
    }

    setLoading(tier);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });

      const data = await response.json();

      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      } else {
        alert(data.error || 'Failed to start checkout');
      }
    } catch {
      alert('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      } else {
        alert(data.error || 'Failed to open subscription portal');
      }
    } catch {
      alert('Failed to open subscription portal');
    }
  };

  const tiers = [
    { id: 'free' as TierName, ...TIERS.free, popular: false },
    { id: 'basic' as TierName, ...TIERS.basic, popular: false },
    { id: 'pro' as TierName, ...TIERS.pro, popular: true },
    { id: 'unlimited' as TierName, ...TIERS.unlimited, popular: false },
  ];

  return (
    <div className="min-h-screen aurora-bg relative overflow-hidden">
      {/* Light beams */}
      <div className="beam h-[500px] left-[20%] top-0 opacity-50" />
      <div className="beam h-[400px] left-[50%] top-0 opacity-30" />
      <div className="beam h-[450px] left-[75%] top-0 opacity-40" />

      {/* Header */}
      <header className="relative z-10 py-6 px-4 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">
            Vocab Extractor
          </Link>
          <div className="space-x-4 flex items-center">
            {isLoggedIn ? (
              <Link
                href="/upload"
                className="text-slate-400 hover:text-white font-medium transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-slate-400 hover:text-white font-medium transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 text-white font-medium rounded-lg glow-button"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-16">
        {/* Back to Dashboard for logged-in users */}
        {isLoggedIn && (
          <Link
            href="/upload"
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
        )}

        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Choose the plan that fits your learning needs. Upgrade or downgrade anytime.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => {
            const isCurrent = currentTier === tier.id;
            const isPopular = tier.popular;

            return (
              <div
                key={tier.id}
                className={`relative glass-card rounded-2xl p-6 flex flex-col ${
                  isPopular ? 'ring-2 ring-indigo-500 shadow-[0_0_30px_-10px_rgba(99,102,241,0.5)]' : ''
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 text-xs font-semibold text-white bg-indigo-500 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute -top-3 right-4">
                    <span className="px-3 py-1 text-xs font-semibold text-emerald-400 bg-emerald-500/20 rounded-full border border-emerald-500/30">
                      Current Plan
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-white mb-2">{tier.name}</h3>
                  <p className="text-sm text-slate-400">{tier.description}</p>
                </div>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">${tier.price}</span>
                  {tier.price > 0 && <span className="text-slate-400">/{tier.billingPeriod}</span>}
                </div>

                <ul className="space-y-3 mb-8 flex-grow">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-slate-300">
                      <svg
                        className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {tier.id === 'free' ? (
                  isCurrent ? (
                    <button
                      disabled
                      className="w-full py-3 px-4 text-slate-400 font-medium rounded-xl border border-white/10 cursor-not-allowed"
                    >
                      Current Plan
                    </button>
                  ) : (
                    <Link
                      href="/register"
                      className="w-full py-3 px-4 text-center text-white font-medium rounded-xl border border-white/20 hover:border-white/40 transition-colors block"
                    >
                      Get Started Free
                    </Link>
                  )
                ) : isCurrent ? (
                  <button
                    onClick={handleManageSubscription}
                    className="w-full py-3 px-4 text-white font-medium rounded-xl border border-indigo-500/50 hover:border-indigo-500 transition-colors"
                  >
                    Manage Subscription
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe(tier.id)}
                    disabled={loading === tier.id}
                    className={`w-full py-3 px-4 text-white font-medium rounded-xl transition-all ${
                      isPopular
                        ? 'glow-button'
                        : 'bg-indigo-600 hover:bg-indigo-500'
                    } ${loading === tier.id ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    {loading === tier.id ? 'Loading...' : `Upgrade to ${tier.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* FAQ or additional info */}
        <div className="mt-16 text-center">
          <p className="text-slate-400">
            Questions? Contact us at{' '}
            <a href="mailto:support@vocabextractor.com" className="text-indigo-400 hover:text-indigo-300">
              support@vocabextractor.com
            </a>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-8 border-t border-white/5 mt-16">
        <div className="max-w-6xl mx-auto px-4 text-center text-slate-500">
          <p>Vocab Extractor - Extract vocabulary from books for Anki</p>
        </div>
      </footer>
    </div>
  );
}
