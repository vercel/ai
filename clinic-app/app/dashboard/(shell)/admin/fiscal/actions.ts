'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfileWithPlan } from '@/lib/auth';
import { log_audit_event_action } from '@/lib/audit';

export async function saveFiscalSettings(formData: FormData) {
  const profile = await requireProfileWithPlan();
  if (profile.role !== 'admin') throw new Error('Unauthorized');

  const supabase = createSupabaseServerClient();

  const municipal_registration = String(formData.get('municipal_registration') ?? '').trim() || null;
  const tax_regime = String(formData.get('tax_regime') ?? '').trim() || null;
  const cnae = String(formData.get('cnae') ?? '').trim() || null;
  const ctiss_code = String(formData.get('ctiss_code') ?? '').trim() || null;
  const iss_rate_raw = formData.get('iss_rate');
  const iss_rate = iss_rate_raw ? parseFloat(String(iss_rate_raw)) : null;
  const cert_path = String(formData.get('cert_path') ?? '').trim() || null;
  const cert_password = String(formData.get('cert_password') ?? '').trim();
  const gateway_provider = String(formData.get('gateway_provider') ?? '').trim() || null;
  const gateway_company_id = String(formData.get('gateway_company_id') ?? '').trim() || null;

  const upsertData: Record<string, unknown> = {
    clinic_id: profile.clinic_id,
    municipal_registration,
    tax_regime,
    cnae,
    ctiss_code,
    iss_rate,
    cert_path,
    gateway_provider,
    gateway_company_id,
    updated_at: new Date().toISOString(),
  };

  // Only encrypt and store password if provided
  if (cert_password) {
    const { data: encrypted } = await supabase.rpc('encrypt_cert_password', {
      p_password: cert_password,
    });
    if (encrypted) {
      upsertData.cert_password_encrypted = encrypted;
    }
  }

  await supabase
    .from('clinic_fiscal_settings')
    .upsert(upsertData, { onConflict: 'clinic_id' });

  await log_audit_event_action({
    clinic_id: profile.clinic_id,
    actor_id: profile.id,
    actor_role: profile.role,
    action: 'update_fiscal_settings',
    table_name: 'clinic_fiscal_settings',
    record_id: profile.clinic_id,
    old_data: null,
    new_data: { municipal_registration, tax_regime, cnae, gateway_provider },
  });

  revalidatePath('/dashboard/admin/fiscal');
}
