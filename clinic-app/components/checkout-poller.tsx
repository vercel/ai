'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Re-checks payment status every few seconds by refetching this Server
 * Component page — if the gateway webhook has since flipped the
 * subscription to 'active', the page's own redirect to
 * /dashboard/onboarding takes over automatically.
 */
export function CheckoutPoller() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
