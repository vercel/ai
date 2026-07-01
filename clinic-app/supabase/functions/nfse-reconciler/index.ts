import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * NFS-e reconciliation job (Dead Letter Queue rescue).
 *
 * The primary path for status updates is the /api/webhooks/nfse push
 * webhook. This function is the fallback: it runs on a schedule (pg_cron,
 * see migration module2_schedule_reconciliation) and actively polls the
 * gateway for any fiscal_notes stuck in "pendente" for more than 24h,
 * covering cases where the gateway's webhook never arrived (network
 * partition, gateway outage, etc).
 *
 * Auth: invoked only by pg_net from inside our own database, so it checks a
 * shared secret header instead of a Supabase user JWT (verify_jwt=false).
 */
Deno.serve(async (req: Request) => {
  const internalSecret = req.headers.get("x-internal-secret");
  if (!internalSecret || internalSecret !== Deno.env.get("INTERNAL_FUNCTIONS_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  // Service role key is auto-injected by the Supabase platform for every
  // deployed Edge Function; it bypasses RLS entirely for this job, which
  // must be able to read/update fiscal_notes across every clinic.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: staleNotes, error } = await supabase
    .from("fiscal_notes")
    .select("id, gateway_invoice_id, clinic_id, created_at")
    .eq("status", "pendente")
    .not("gateway_invoice_id", "is", null)
    .lt("created_at", cutoff)
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // fiscal_notes and clinic_fiscal_settings are sibling tables (both FK to
  // clinics), so PostgREST can't auto-embed one through the other; fetch the
  // gateway providers for the involved clinics in a single separate query.
  const clinicIds = [...new Set((staleNotes ?? []).map((n) => n.clinic_id))];
  const { data: fiscalSettings } = await supabase
    .from("clinic_fiscal_settings")
    .select("clinic_id, gateway_provider")
    .in("clinic_id", clinicIds);
  const providerByClinic = new Map((fiscalSettings ?? []).map((f) => [f.clinic_id, f.gateway_provider]));

  const results: { id: string; outcome: string }[] = [];

  for (const note of staleNotes ?? []) {
    try {
      const gatewayStatus = await fetchStatusFromGateway(
        providerByClinic.get(note.clinic_id) ?? null,
        note.gateway_invoice_id!,
      );

      if (!gatewayStatus) {
        results.push({ id: note.id, outcome: "gateway_unreachable_retry_later" });
        continue;
      }

      await supabase.rpc("nfse_webhook_update", {
        p_secret: Deno.env.get("NFSE_WEBHOOK_SECRET"),
        p_gateway_invoice_id: note.gateway_invoice_id,
        p_status: gatewayStatus.status,
        p_number: gatewayStatus.number ?? null,
        p_series: gatewayStatus.series ?? null,
        p_pdf_url: gatewayStatus.pdf_url ?? null,
        p_xml_url: gatewayStatus.xml_url ?? null,
        p_error_message: gatewayStatus.error_message ?? null,
      });

      results.push({ id: note.id, outcome: `reconciled:${gatewayStatus.status}` });
    } catch (err) {
      results.push({ id: note.id, outcome: `error:${(err as Error).message}` });
    }
  }

  return new Response(JSON.stringify({ ok: true, checked: staleNotes?.length ?? 0, results }), {
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * Gateway-specific status lookup. Replace the URL/parsing below with the
 * real provider's "get invoice status" endpoint (nfse.io, eNotas, Focus NFe,
 * Nuvem Fiscal, ...); each provider is configured per clinic in
 * clinic_fiscal_settings.gateway_provider.
 */
async function fetchStatusFromGateway(
  provider: string | null,
  gatewayInvoiceId: string,
): Promise<{ status: string; number?: string; series?: string; pdf_url?: string; xml_url?: string; error_message?: string } | null> {
  if (!provider) return null;

  const apiKey = Deno.env.get(`${provider.toUpperCase()}_API_KEY`);
  if (!apiKey) return null;

  const response = await fetch(`https://api.${provider}.example.com/invoices/${gatewayInvoiceId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) return null;
  const body = await response.json();

  return {
    status: body.status,
    number: body.number,
    series: body.series,
    pdf_url: body.pdf_url,
    xml_url: body.xml_url,
    error_message: body.error_message,
  };
}
