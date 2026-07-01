'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfile, requireProfileWithPlan } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

export async function createCollaborator(formData: FormData) {
  const profile = await requireProfileWithPlan();
  requireAdmin(profile);

  if (!profile.clinic_id) {
    redirect('/dashboard/admin?error=Clínica não encontrada');
  }

  const supabase = createSupabaseServerClient();
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', profile.clinic_id);

  const maxUsers = profile.plan?.max_users ?? null;
  if (maxUsers !== null && (count ?? 0) >= maxUsers) {
    redirect(
      `/dashboard/admin?error=${encodeURIComponent('Limite de usuários do plano atingido')}`,
    );
  }

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('full_name') ?? '');
  const role = String(formData.get('role') ?? 'recepcao') as UserRole;

  const signupClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { error } = await signupClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role, clinic_id: profile.clinic_id } },
  });

  if (error) {
    redirect(`/dashboard/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/admin');
}

export async function updateUserRole(userId: string, role: UserRole) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('profiles').update({ role }).eq('id', userId);
  revalidatePath('/dashboard/admin');
}

export async function createRoom(formData: FormData) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('rooms').insert({
    clinic_id: profile.clinic_id,
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? '') || null,
    capacity: Number(formData.get('capacity') ?? 1) || 1,
  });

  revalidatePath('/dashboard/admin');
}

export async function toggleRoomActive(id: string, isActive: boolean) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('rooms').update({ is_active: isActive }).eq('id', id);
  revalidatePath('/dashboard/admin');
}

export async function deleteRoom(id: string) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('rooms').delete().eq('id', id);
  revalidatePath('/dashboard/admin');
}

export async function createMessageTemplate(formData: FormData) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('message_templates').insert({
    clinic_id: profile.clinic_id,
    name: String(formData.get('name') ?? ''),
    subject: String(formData.get('subject') ?? '') || null,
    content: String(formData.get('content') ?? ''),
    message_type: String(formData.get('message_type') ?? 'WhatsApp'),
    purpose: String(formData.get('purpose') ?? '') || null,
  });

  revalidatePath('/dashboard/admin');
}

export async function toggleMessageTemplateActive(id: string, isActive: boolean) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('message_templates').update({ is_active: isActive }).eq('id', id);
  revalidatePath('/dashboard/admin');
}

export async function deleteMessageTemplate(id: string) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('message_templates').delete().eq('id', id);
  revalidatePath('/dashboard/admin');
}

export async function createPaymentMethod(formData: FormData) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('payment_methods').insert({
    clinic_id: profile.clinic_id,
    name: String(formData.get('name') ?? ''),
    payment_type: String(formData.get('payment_type') ?? '') || null,
    is_default: formData.get('is_default') === 'on',
  });

  revalidatePath('/dashboard/admin');
}

export async function deletePaymentMethod(id: string) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('payment_methods').delete().eq('id', id);
  revalidatePath('/dashboard/admin');
}

export async function updateClinicSettings(formData: FormData) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  const { data: existing } = await supabase
    .from('clinic_settings')
    .select('id')
    .limit(1)
    .maybeSingle<{ id: string }>();

  const values = {
    clinic_name: String(formData.get('clinic_name') ?? ''),
    cnpj: String(formData.get('cnpj') ?? '') || null,
    address: String(formData.get('address') ?? '') || null,
    phone: String(formData.get('phone') ?? '') || null,
    email: String(formData.get('email') ?? '') || null,
    logo_url: String(formData.get('logo_url') ?? '') || null,
    primary_color: String(formData.get('primary_color') ?? '') || null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('clinic_settings').update(values).eq('id', existing.id);
  } else {
    await supabase.from('clinic_settings').insert(values);
  }

  revalidatePath('/dashboard/admin');
}
