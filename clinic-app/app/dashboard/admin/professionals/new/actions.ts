'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfileWithPlan } from '@/lib/auth';
import { isValidDocumentLength, onlyDigits } from '@/lib/document';
import { log_audit_event_action } from '@/lib/audit';

export async function createProfessional(formData: FormData) {
  const profile = await requireProfileWithPlan();
  requireAdmin(profile);

  if (!profile.clinic_id) {
    redirect('/dashboard/admin/professionals/new?error=Clínica não encontrada');
  }

  const supabase = createSupabaseServerClient();

  // Enforce the plan's seat limit, same rule used for regular collaborators.
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', profile.clinic_id);

  const maxUsers = profile.plan?.max_users ?? null;
  if (maxUsers !== null && (count ?? 0) >= maxUsers) {
    redirect(`/dashboard/admin/professionals/new?error=${encodeURIComponent('Limite de usuários do plano atingido')}`);
  }

  const fullName = String(formData.get('full_name') ?? '').trim();
  const cpf = onlyDigits(String(formData.get('cpf') ?? ''));
  const councilRegistration = String(formData.get('council_registration') ?? '').trim();
  const specialty = String(formData.get('specialty') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const commissionRate = Number(formData.get('commission_rate') ?? 0);

  if (!fullName || !email || password.length < 6) {
    redirect('/dashboard/admin/professionals/new?error=Preencha nome, e-mail e senha (mín. 6 caracteres)');
  }
  if (cpf && !isValidDocumentLength(cpf)) {
    redirect('/dashboard/admin/professionals/new?error=CPF inválido');
  }
  if (Number.isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100) {
    redirect('/dashboard/admin/professionals/new?error=Percentual de repasse inválido');
  }

  // Session-less client so this signUp call never touches the admin's own
  // cookie-based session.
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
    redirect(`/dashboard/admin/professionals/new?error=${encodeURIComponent(authError?.message ?? 'Não foi possível criar o profissional')}`);
  }

  // The signup trigger creates the profiles row from auth metadata; fill in
  // the professional-specific fields the trigger doesn't know about.
  await supabase
    .from('profiles')
    .update({
      email,
      cpf: cpf || null,
      council_registration: councilRegistration || null,
      specialty: specialty || null,
      phone: phone || null,
      commission_rate: commissionRate,
    })
    .eq('id', authData.user.id);

  await log_audit_event_action({
    clinic_id: profile.clinic_id,
    actor_id: profile.id,
    actor_role: profile.role,
    action: 'create_professional',
    table_name: 'profiles',
    record_id: authData.user.id,
    old_data: null,
    new_data: { full_name: fullName, specialty, commission_rate: commissionRate },
  });

  revalidatePath('/dashboard/admin');
  redirect('/dashboard/admin?success=Profissional cadastrado com sucesso');
}
