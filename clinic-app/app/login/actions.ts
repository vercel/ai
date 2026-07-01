'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isValidDocumentLength, onlyDigits } from '@/lib/document';

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect('/dashboard');
}

export async function signup(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('full_name') ?? '');
  const clinicName = String(formData.get('clinic_name') ?? '');
  const legalName = String(formData.get('legal_name') ?? '');
  const documentNumber = onlyDigits(String(formData.get('document_number') ?? ''));
  const planId = String(formData.get('plan_id') ?? '');

  if (!isValidDocumentLength(documentNumber)) {
    redirect(`/signup?error=${encodeURIComponent('CPF ou CNPJ inválido. Verifique a quantidade de dígitos.')}`);
  }

  const supabase = createSupabaseServerClient();

  // Fetch plan to get trial_days
  const { data: plan } = await supabase
    .from('plans')
    .select('id, trial_days')
    .eq('id', planId)
    .single<{ id: string; trial_days: number }>();

  const trialEndsAt = plan?.trial_days
    ? new Date(Date.now() + plan.trial_days * 86400000).toISOString()
    : null;

  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .insert({
      name: clinicName,
      legal_name: legalName,
      document_number: documentNumber,
      plan_id: planId,
      trial_ends_at: trialEndsAt,
    })
    .select('id')
    .single<{ id: string }>();

  if (clinicError || !clinic) {
    redirect(
      `/signup?error=${encodeURIComponent(clinicError?.message ?? 'Não foi possível criar a clínica')}`,
    );
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role: 'admin', clinic_id: clinic.id } },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // Create subscription row for this clinic
  const periodEnd = trialEndsAt ?? new Date(Date.now() + 30 * 86400000).toISOString();
  await supabase.from('subscriptions').insert({
    clinic_id: clinic.id,
    plan_id: planId,
    status: trialEndsAt ? 'trialing' : 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: periodEnd,
  });

  redirect('/login?message=Verifique seu e-mail para confirmar o cadastro');
}

export async function logout() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
