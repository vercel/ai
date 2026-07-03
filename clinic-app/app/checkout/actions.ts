'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

/**
 * Stand-in for the real gateway integration (Stripe/Asaas): in production
 * this would create a hosted checkout session and return its URL for the
 * client to redirect to, and activation would happen via the gateway's
 * webhook (see app/api/webhooks/billing) — never directly from this
 * action. This mock simulates "the webhook fired" so the paywall flow can
 * be exercised end-to-end before a real gateway is wired up.
 */
export async function mockConfirmPayment() {
  const profile = await requireProfile();

  if (!profile.clinic_id) {
    return;
  }

  const supabase = createSupabaseServerClient();

  await supabase
    .from('subscriptions')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'pending_payment');

  await supabase.from('clinics').update({ is_active: true }).eq('id', profile.clinic_id);

  revalidatePath('/checkout');
}
