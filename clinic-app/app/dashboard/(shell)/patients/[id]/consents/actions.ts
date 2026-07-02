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

export async function createConsentForm(patientId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('consent_forms').insert({
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    title: String(formData.get('title') ?? ''),
    content: String(formData.get('content') ?? ''),
    created_by: profile.id,
  });

  if (error) {
    redirect(
      `/dashboard/patients/${patientId}/consents/new?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/dashboard/patients/${patientId}/consents`);
  redirect(`/dashboard/patients/${patientId}/consents`);
}

export async function signConsentForm(
  patientId: string,
  consentId: string,
  signatureData: string,
  signerName: string,
) {
  await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: consent } = await supabase
    .from('consent_forms')
    .select('content, signed_at')
    .eq('id', consentId)
    .single<{ content: string; signed_at: string | null }>();

  if (!consent || consent.signed_at) {
    return;
  }

  const signedAt = new Date().toISOString();
  const contentHash = createHash('sha256')
    .update(`${consent.content}|${signerName}|${signedAt}`)
    .digest('hex');

  await supabase
    .from('consent_forms')
    .update({
      signed_at: signedAt,
      signer_name: signerName,
      signature_data: signatureData,
      content_hash: contentHash,
      signer_ip: requestIp(),
    })
    .eq('id', consentId);

  revalidatePath(`/dashboard/patients/${patientId}/consents`);
}

export async function deleteConsentForm(patientId: string, consentId: string) {
  await requireProfile();
  const supabase = createSupabaseServerClient();
  await supabase.from('consent_forms').delete().eq('id', consentId);
  revalidatePath(`/dashboard/patients/${patientId}/consents`);
}
