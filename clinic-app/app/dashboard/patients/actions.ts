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

export async function addMedicalRecord(patientId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  await supabase.from('medical_records').insert({
    patient_id: patientId,
    professional_id: profile.id,
    entry: String(formData.get('entry') ?? ''),
  });

  revalidatePath(`/dashboard/patients/${patientId}`);
}
