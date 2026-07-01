'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

function requestIp() {
  const forwardedFor = headers().get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || null;
}

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
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: doc } = await supabase
    .from('document_signatures')
    .select('title, document_url, signed_at')
    .eq('id', id)
    .single<{ title: string; document_url: string | null; signed_at: string | null }>();

  if (!doc || doc.signed_at) return;

  const signedAt = new Date().toISOString();
  const contentHash = createHash('sha256')
    .update(`${doc.title}|${doc.document_url ?? ''}|${profile.id}|${signedAt}`)
    .digest('hex');

  await supabase
    .from('document_signatures')
    .update({
      status: 'assinado',
      signed_at: signedAt,
      signer_id: profile.id,
      signer_ip: requestIp(),
      content_hash: contentHash,
    })
    .eq('id', id);
  revalidatePath('/dashboard/signatures');
}

export async function cancelSignatureRequest(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('document_signatures').update({ status: 'cancelado' }).eq('id', id);
  revalidatePath('/dashboard/signatures');
}
