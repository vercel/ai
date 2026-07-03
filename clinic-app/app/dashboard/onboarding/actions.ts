'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfile } from '@/lib/auth';
import { onlyDigits } from '@/lib/document';
import { log_audit_event_action } from '@/lib/audit';

export async function completeOnboarding(formData: FormData) {
  const profile = await requireProfile();
  requireAdmin(profile);

  if (!profile.clinic_id) {
    redirect('/dashboard/onboarding?error=Clínica não encontrada');
  }

  const supabase = createSupabaseServerClient();

  const clinicName = String(formData.get('clinic_name') ?? '').trim();
  const cnpj = onlyDigits(String(formData.get('document_number') ?? ''));
  const clinicPhone = String(formData.get('clinic_phone') ?? '').trim();
  const clinicAddress = String(formData.get('clinic_address') ?? '').trim();

  const fullName = String(formData.get('full_name') ?? '').trim();
  const specialty = String(formData.get('specialty') ?? '').trim();
  const councilRegistration = String(formData.get('council_registration') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!clinicName || cnpj.length !== 14) {
    redirect('/dashboard/onboarding?error=Informe o nome fantasia e um CNPJ válido');
  }
  if (!clinicPhone || !clinicAddress) {
    redirect('/dashboard/onboarding?error=Informe telefone e endereço da clínica');
  }
  if (!fullName || !email || password.length < 6) {
    redirect('/dashboard/onboarding?error=Preencha nome, e-mail e senha do profissional (mín. 6 caracteres)');
  }

  await supabase
    .from('clinics')
    .update({ name: clinicName, document_number: cnpj })
    .eq('id', profile.clinic_id);

  const settingsValues = {
    clinic_id: profile.clinic_id,
    clinic_name: clinicName,
    cnpj,
    phone: clinicPhone,
    address: clinicAddress,
    updated_at: new Date().toISOString(),
  };

  await supabase.from('clinic_settings').upsert(settingsValues, { onConflict: 'clinic_id' });

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: authData, error: authError } = await authClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role: 'medico', clinic_id: profile.clinic_id } },
  });

  if (authError || !authData.user) {
    redirect(
      `/dashboard/onboarding?error=${encodeURIComponent(authError?.message ?? 'Não foi possível cadastrar o profissional')}`,
    );
  }

  await supabase
    .from('profiles')
    .update({
      email,
      specialty: specialty || null,
      council_registration: councilRegistration || null,
    })
    .eq('id', authData.user.id);

  await supabase.from('clinics').update({ onboarding_completed: true }).eq('id', profile.clinic_id);

  await log_audit_event_action({
    clinic_id: profile.clinic_id,
    actor_id: profile.id,
    actor_role: profile.role,
    action: 'complete_onboarding',
    table_name: 'clinics',
    record_id: profile.clinic_id,
    old_data: null,
    new_data: { clinic_name: clinicName, professional_email: email },
  });

  redirect('/dashboard');
}
