import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const eventSchema = z.object({
  event_type: z.enum(['payment_confirmed', 'payment_failed']),
  gateway_subscription_id: z.string().min(1),
  gateway_invoice_id: z.string().nullish(),
  amount_cents: z.number().int().nullish(),
  due_date: z.string().nullish(),
});

/**
 * Generic billing webhook receiver (Stripe, Asaas, or any gateway that can
 * be normalized to { event_type, gateway_subscription_id }).
 *
 * On "payment_confirmed" it moves the subscription out of past_due/suspended
 * back to active — this is what unblocks a clinic's access automatically,
 * without any manual intervention from the Super Admin.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.BILLING_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const normalized = normalizeGatewayPayload(json);
  const parsed = eventSchema.safeParse(normalized);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: updated, error } = await supabase.rpc('billing_webhook_update', {
    p_secret: secret,
    p_gateway_subscription_id: parsed.data.gateway_subscription_id,
    p_event_type: parsed.data.event_type,
    p_gateway_invoice_id: parsed.data.gateway_invoice_id ?? null,
    p_amount_cents: parsed.data.amount_cents ?? null,
    p_due_date: parsed.data.due_date ?? null,
  });

  if (error) {
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: Boolean(updated) });
}

/**
 * Adapts a specific gateway's payload shape into our normalized
 * { event_type, gateway_subscription_id } contract. Extend as new gateways
 * are wired up; the Stripe/Asaas shapes below are illustrative.
 */
function normalizeGatewayPayload(json: unknown): unknown {
  const body = json as Record<string, unknown>;

  // Stripe: invoice.paid / invoice.payment_failed with subscription id.
  if (typeof body.type === 'string' && body.data) {
    const stripeObject = (body.data as any)?.object ?? {};
    const eventTypeMap: Record<string, string> = {
      'invoice.paid': 'payment_confirmed',
      'invoice.payment_succeeded': 'payment_confirmed',
      'invoice.payment_failed': 'payment_failed',
    };
    return {
      event_type: eventTypeMap[body.type],
      gateway_subscription_id: stripeObject.subscription ?? stripeObject.id,
      gateway_invoice_id: stripeObject.id,
      amount_cents: stripeObject.amount_paid ?? stripeObject.amount_due ?? null,
      due_date: stripeObject.due_date
        ? new Date(stripeObject.due_date * 1000).toISOString()
        : null,
    };
  }

  // Asaas: PAYMENT_CONFIRMED / PAYMENT_OVERDUE with subscription reference.
  if (typeof body.event === 'string') {
    const asaasEventMap: Record<string, string> = {
      PAYMENT_CONFIRMED: 'payment_confirmed',
      PAYMENT_RECEIVED: 'payment_confirmed',
      PAYMENT_OVERDUE: 'payment_failed',
    };
    const payment = (body.payment as any) ?? {};
    return {
      event_type: asaasEventMap[body.event],
      gateway_subscription_id: payment.subscription,
      gateway_invoice_id: payment.id,
      amount_cents: payment.value ? Math.round(payment.value * 100) : null,
      due_date: payment.dueDate ? new Date(payment.dueDate).toISOString() : null,
    };
  }

  return body;
}
