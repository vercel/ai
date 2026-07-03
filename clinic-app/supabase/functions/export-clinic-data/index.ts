import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * LGPD data portability export.
 *
 * Consolidates every row scoped to a clinic_id into a single JSON manifest
 * (structured data + references to stored files: patient documents, signed
 * medical record attachments, fiscal note PDFs/XMLs), uploads it to the
 * private "exports" bucket, and issues a time-limited signed URL.
 *
 * Triggered two ways:
 *  1. Automatically by the `export_on_cancellation_trg` DB trigger when a
 *     subscription's status transitions to 'canceled'.
 *  2. On demand, via the "Solicitar exportação" action in
 *     /dashboard/admin/subscription (see exportClinicData server action).
 */
const EXPORTED_TABLES = [
  "patients",
  "medical_records",
  "invoices",
  "invoice_items",
  "prescriptions",
  "consent_forms",
  "document_signatures",
  "therapy_plans",
  "lab_orders",
  "patient_documents",
  "appointments",
  "fiscal_notes",
] as const;

const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

Deno.serve(async (req: Request) => {
  const internalSecret = req.headers.get("x-internal-secret");
  if (!internalSecret || internalSecret !== Deno.env.get("INTERNAL_FUNCTIONS_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { clinic_id, reason } = await req.json();
  if (!clinic_id) {
    return new Response(JSON.stringify({ error: "clinic_id is required" }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const manifest: Record<string, unknown> = {
      clinic_id,
      exported_at: new Date().toISOString(),
      reason: reason ?? "manual",
      tables: {},
    };

    for (const table of EXPORTED_TABLES) {
      const { data, error } = await supabase.from(table).select("*").eq("clinic_id", clinic_id);
      if (error) throw new Error(`failed reading ${table}: ${error.message}`);
      (manifest.tables as Record<string, unknown>)[table] = data;
    }

    const filePath = `${clinic_id}/export-${Date.now()}.json`;
    const { error: uploadError } = await supabase.storage
      .from("exports")
      .upload(filePath, JSON.stringify(manifest, null, 2), {
        contentType: "application/json",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: signed, error: signError } = await supabase.storage
      .from("exports")
      .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
    if (signError) throw signError;

    await supabase
      .from("data_exports")
      .update({
        status: "ready",
        file_path: filePath,
        signed_url: signed.signedUrl,
        expires_at: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      })
      .eq("clinic_id", clinic_id)
      .eq("status", "processing");

    return new Response(JSON.stringify({ ok: true, file_path: filePath }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    await supabase
      .from("data_exports")
      .update({ status: "failed", error_message: (err as Error).message })
      .eq("clinic_id", clinic_id)
      .eq("status", "processing");

    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
