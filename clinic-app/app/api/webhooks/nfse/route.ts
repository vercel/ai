import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const payloadSchema = z.object({
  gateway_invoice_id: z.string().min(1),
  status: z.string().min(1),
  number: z.string().nullish(),
  series: z.string().nullish(),
  pdf_url: z.string().nullish(),
  xml_url: z.string().nullish(),
  error_message: z.string().nullish(),
});

/**
 * Idempotent webhook receiver for async NFS-e gateway callbacks (status updates
 * on previously issued fiscal notes). Authenticated via a shared secret header
 * rather than a Supabase session, since the caller is an external service.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.NFSE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const body = parsed.data;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: updated, error } = await supabase.rpc('nfse_webhook_update', {
    p_secret: secret,
    p_gateway_invoice_id: body.gateway_invoice_id,
    p_status: body.status,
    p_number: body.number ?? null,
    p_series: body.series ?? null,
    p_pdf_url: body.pdf_url ?? null,
    p_xml_url: body.xml_url ?? null,
    p_error_message: body.error_message ?? null,
  });

  if (error) {
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: Boolean(updated) });
}
