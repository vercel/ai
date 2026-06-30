'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfile } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

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
