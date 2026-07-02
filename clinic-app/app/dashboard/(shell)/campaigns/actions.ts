'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function createCampaign(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('campaigns').insert({
    clinic_id: profile.clinic_id,
    name: String(formData.get('name') ?? ''),
    channel: String(formData.get('channel') ?? 'email'),
    message: String(formData.get('message') ?? ''),
    target_filter: String(formData.get('target_filter') ?? '') || null,
    scheduled_at: String(formData.get('scheduled_at') ?? '') || null,
    created_by: profile.id,
  });

  if (error) {
    redirect(`/dashboard/campaigns/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/campaigns');
  redirect('/dashboard/campaigns');
}

export async function markCampaignSent(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('campaigns').update({ status: 'enviada' }).eq('id', id);
  revalidatePath('/dashboard/campaigns');
}

export async function deleteCampaign(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('campaigns').delete().eq('id', id);
  revalidatePath('/dashboard/campaigns');
}

export async function addToBlocklist(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('campaign_blocklist').insert({
    clinic_id: profile.clinic_id,
    contact: String(formData.get('contact') ?? ''),
    reason: String(formData.get('reason') ?? '') || null,
  });

  if (error) {
    redirect(`/dashboard/campaigns/blocklist?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/campaigns/blocklist');
  redirect('/dashboard/campaigns/blocklist');
}

export async function removeFromBlocklist(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('campaign_blocklist').delete().eq('id', id);
  revalidatePath('/dashboard/campaigns/blocklist');
}
