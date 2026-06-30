'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function createSignatureRequest(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('document_signatures').insert({
    clinic_id: profile.clinic_id,
    title: String(formData.get('title') ?? ''),
    patient_id: String(formData.get('patient_id') ?? '') || null,
  });

  if (error) {
    redirect(`/dashboard/signatures/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/signatures');
  redirect('/dashboard/signatures');
}

export async function markSignatureSigned(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase
    .from('document_signatures')
    .update({ status: 'assinado', signed_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath('/dashboard/signatures');
}

export async function cancelSignatureRequest(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('document_signatures').update({ status: 'cancelado' }).eq('id', id);
  revalidatePath('/dashboard/signatures');
}
