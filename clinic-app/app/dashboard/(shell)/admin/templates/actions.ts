'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfile } from '@/lib/auth';

export async function createTemplate(formData: FormData) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const title = String(formData.get('title') ?? '').trim();
  const content = String(formData.get('content') ?? '').trim();
  const isContentEmpty = content.replace(/<[^>]*>/g, '').trim().length === 0;

  if (!title || isContentEmpty) {
    redirect('/dashboard/admin/templates?error=Preencha título e conteúdo do modelo');
  }

  const supabase = createSupabaseServerClient();
  await supabase.from('medical_record_templates').insert({
    clinic_id: profile.clinic_id,
    title,
    content,
    created_by: profile.id,
  });

  revalidatePath('/dashboard/admin/templates');
}

export async function deleteTemplate(templateId: string) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('medical_record_templates').delete().eq('id', templateId);

  revalidatePath('/dashboard/admin/templates');
}
