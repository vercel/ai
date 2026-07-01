'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import { log_audit_event_action } from '@/lib/audit';
import { isValidDocumentLength, onlyDigits } from '@/lib/document';

export async function createClinicManually(formData: FormData) {
  const actor = await requireSuperAdmin();

  const clinicName = String(formData.get('clinic_name') ?? '').trim();
  const legalName = String(formData.get('legal_name') ?? '').trim();
  const documentNumber = onlyDigits(String(formData.get('document_number') ?? ''));
  const planId = String(formData.get('plan_id') ?? '');
  const adminFullName = String(formData.get('admin_full_name') ?? '').trim();
  const adminEmail = String(formData.get('admin_email') ?? '').trim();
  const adminPassword = String(formData.get('admin_password') ?? '');

  if (!clinicName || !planId || !adminFullName || !adminEmail || adminPassword.length < 6) {
    redirect('/super-admin/clinics/new?error=Preencha todos os campos obrigatórios (senha com pelo menos 6 caracteres).');
  }
  if (!isValidDocumentLength(documentNumber)) {
    redirect('/super-admin/clinics/new?error=CPF ou CNPJ inválido. Verifique a quantidade de dígitos.');
  }

  const supabase = createSupabaseServerClient();

  // Clinics created manually by a super admin start active immediately
  // (30-day billing period), skipping the self-serve trial.
  const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();

  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .insert({
      name: clinicName,
      legal_name: legalName || null,
      document_number: documentNumber,
      plan_id: planId,
    })
    .select('id')
    .single<{ id: string }>();

  if (clinicError || !clinic) {
    redirect(`/super-admin/clinics/new?error=${encodeURIComponent(clinicError?.message ?? 'Não foi possível criar a clínica')}`);
  }

  // A fresh, session-less client for the auth signup call, so it never
  // touches the super admin's own cookie-based session in this request.
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error: authError } = await authClient.auth.signUp({
    email: adminEmail,
    password: adminPassword,
    options: { data: { full_name: adminFullName, role: 'admin', clinic_id: clinic.id } },
  });

  if (authError) {
    // Roll back the clinic so we don't leave an orphaned, unusable record.
    await supabase.from('clinics').delete().eq('id', clinic.id);
    redirect(`/super-admin/clinics/new?error=${encodeURIComponent(authError.message)}`);
  }

  await supabase.from('subscriptions').insert({
    clinic_id: clinic.id,
    plan_id: planId,
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: periodEnd,
  });

  await log_audit_event_action({
    clinic_id: clinic.id,
    actor_id: actor.id,
    actor_role: 'super_admin',
    action: 'create_clinic_manually',
    table_name: 'clinics',
    record_id: clinic.id,
    old_data: null,
    new_data: { name: clinicName, plan_id: planId, admin_email: adminEmail },
  });

  revalidatePath('/super-admin');
  revalidatePath('/super-admin/clinics');
  redirect('/super-admin/clinics?success=Clínica cadastrada com sucesso');
}
