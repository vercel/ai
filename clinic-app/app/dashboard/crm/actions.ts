'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { LeadStage } from '@/lib/types';

export async function createLead(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('leads').insert({
    full_name: String(formData.get('full_name') ?? ''),
    phone: String(formData.get('phone') ?? '') || null,
    email: String(formData.get('email') ?? '') || null,
    source: String(formData.get('source') ?? '') || null,
    notes: String(formData.get('notes') ?? '') || null,
    created_by: profile.id,
  });

  if (error) {
    redirect(`/dashboard/crm/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/crm');
  redirect('/dashboard/crm');
}

export async function updateLeadStage(id: string, stage: LeadStage) {
  const supabase = createSupabaseServerClient();
  await supabase.from('leads').update({ stage }).eq('id', id);
  revalidatePath('/dashboard/crm');
}

export async function deleteLead(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('leads').delete().eq('id', id);
  revalidatePath('/dashboard/crm');
}
