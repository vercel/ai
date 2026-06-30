'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { ConversationStatus } from '@/lib/types';

export async function createConversation(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('conversations').insert({
    clinic_id: profile.clinic_id,
    contact_name: String(formData.get('contact_name') ?? ''),
    contact_phone: String(formData.get('contact_phone') ?? '') || null,
    channel: String(formData.get('channel') ?? 'whatsapp'),
  });

  if (error) {
    redirect(`/dashboard/conversations/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/conversations');
  redirect('/dashboard/conversations');
}

export async function sendMessage(conversationId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();
  const body = String(formData.get('body') ?? '').trim();

  if (!body) {
    return;
  }

  await supabase.from('conversation_messages').insert({
    clinic_id: profile.clinic_id,
    conversation_id: conversationId,
    sender: 'equipe',
    body,
    sent_by: profile.id,
  });

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  revalidatePath(`/dashboard/conversations/${conversationId}`);
}

export async function updateConversationStatus(id: string, status: ConversationStatus) {
  const supabase = createSupabaseServerClient();
  await supabase.from('conversations').update({ status }).eq('id', id);
  revalidatePath('/dashboard/conversations');
  revalidatePath(`/dashboard/conversations/${id}`);
}

export async function updateAssistantSettings(id: string, formData: FormData) {
  const supabase = createSupabaseServerClient();

  await supabase
    .from('assistant_settings')
    .update({
      name: String(formData.get('name') ?? 'Fer'),
      persona: String(formData.get('persona') ?? ''),
      enabled: formData.get('enabled') === 'on',
      auto_schedule: formData.get('auto_schedule') === 'on',
      auto_broadcast: formData.get('auto_broadcast') === 'on',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  revalidatePath('/dashboard/conversations/assistant');
}
