'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function createFiscalNote(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('fiscal_notes').insert({
    clinic_id: profile.clinic_id,
    invoice_id: String(formData.get('invoice_id') ?? ''),
    number: String(formData.get('number') ?? '') || null,
    series: String(formData.get('series') ?? '') || null,
  });

  if (error) {
    redirect(`/dashboard/fiscal-notes/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/fiscal-notes');
  redirect('/dashboard/fiscal-notes');
}

export async function markFiscalNoteIssued(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase
    .from('fiscal_notes')
    .update({ status: 'emitida', issued_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath('/dashboard/fiscal-notes');
}

export async function cancelFiscalNote(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('fiscal_notes').update({ status: 'cancelada' }).eq('id', id);
  revalidatePath('/dashboard/fiscal-notes');
}
