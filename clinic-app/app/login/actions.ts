'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  const planId = String(formData.get('plan_id') ?? '');

  const supabase = createSupabaseServerClient();

  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .insert({ name: clinicName, plan_id: planId })
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

  redirect('/login?message=Verifique seu e-mail para confirmar o cadastro');
}

export async function logout() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
