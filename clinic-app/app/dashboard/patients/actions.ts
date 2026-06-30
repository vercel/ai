'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function createPatient(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('patients').insert({
    full_name: String(formData.get('full_name') ?? ''),
    cpf: String(formData.get('cpf') ?? '') || null,
    birth_date: String(formData.get('birth_date') ?? '') || null,
    phone: String(formData.get('phone') ?? '') || null,
    email: String(formData.get('email') ?? '') || null,
    address: String(formData.get('address') ?? '') || null,
    created_by: profile.id,
  });

  if (error) {
    redirect(`/dashboard/patients/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/patients');
  redirect('/dashboard/patients');
}

export async function updatePatient(id: string, formData: FormData) {
  await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from('patients')
    .update({
      full_name: String(formData.get('full_name') ?? ''),
      cpf: String(formData.get('cpf') ?? '') || null,
      birth_date: String(formData.get('birth_date') ?? '') || null,
      phone: String(formData.get('phone') ?? '') || null,
      email: String(formData.get('email') ?? '') || null,
      address: String(formData.get('address') ?? '') || null,
    })
    .eq('id', id);

  if (error) {
    redirect(`/dashboard/patients/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/patients');
  revalidatePath(`/dashboard/patients/${id}`);
  redirect('/dashboard/patients');
}

export async function deletePatient(id: string) {
  await requireProfile();
  const supabase = createSupabaseServerClient();
  await supabase.from('patients').delete().eq('id', id);
  revalidatePath('/dashboard/patients');
}

export async function addMedicalRecord(patientId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const attachments: string[] = [];
  const file = formData.get('attachment') as File | null;
  if (file && file.size > 0) {
    const path = `${patientId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file);
    if (!uploadError) {
      attachments.push(path);
    }
  }

  await supabase.from('medical_records').insert({
    patient_id: patientId,
    professional_id: profile.id,
    entry: String(formData.get('entry') ?? ''),
    attachments,
  });

  revalidatePath(`/dashboard/patients/${patientId}`);
}

export async function getAttachmentUrl(path: string) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.storage.from('attachments').createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}
