'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { CRM_STAGES } from '@/lib/crm';

export async function createCrmContact(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('patient_crm').insert({
    clinic_id: profile.clinic_id,
    full_name: String(formData.get('full_name') ?? ''),
    phone: String(formData.get('phone') ?? '') || null,
    email: String(formData.get('email') ?? '') || null,
    source: String(formData.get('source') ?? '') || null,
    notes: String(formData.get('notes') ?? '') || null,
    current_stage: CRM_STAGES[0],
    responsible_id: profile.id,
  });

  if (error) {
    redirect(`/dashboard/crm/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/crm');
  redirect('/dashboard/crm');
}

export async function addPatientToCrm(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const patientId = String(formData.get('patient_id') ?? '');
  if (!patientId) return;

  await supabase.from('patient_crm').insert({
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    current_stage: CRM_STAGES[0],
    next_action: String(formData.get('next_action') ?? '') || null,
    responsible_id: profile.id,
  });

  revalidatePath('/dashboard/crm');
}

export async function updatePatientCrmStage(id: string, stage: string) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: current } = await supabase
    .from('patient_crm')
    .select('current_stage')
    .eq('id', id)
    .single<{ current_stage: string }>();

  await supabase
    .from('patient_crm')
    .update({ current_stage: stage, last_interaction_date: new Date().toISOString() })
    .eq('id', id);

  await supabase.from('crm_interactions').insert({
    clinic_id: profile.clinic_id,
    patient_crm_id: id,
    interaction_type: 'Mudança de estágio',
    author_id: profile.id,
    stage_before: current?.current_stage ?? null,
    stage_after: stage,
  });

  revalidatePath('/dashboard/crm');
}

export async function deletePatientCrm(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('patient_crm').delete().eq('id', id);
  revalidatePath('/dashboard/crm');
}

export async function convertCrmContactToPatient(id: string) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: contact } = await supabase
    .from('patient_crm')
    .select('patient_id, full_name, phone, email')
    .eq('id', id)
    .single<{ patient_id: string | null; full_name: string | null; phone: string | null; email: string | null }>();

  if (!contact || contact.patient_id) {
    return;
  }

  const { data: patient, error } = await supabase
    .from('patients')
    .insert({
      clinic_id: profile.clinic_id,
      full_name: contact.full_name ?? '',
      phone: contact.phone,
      email: contact.email,
      created_by: profile.id,
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !patient) {
    return;
  }

  await supabase
    .from('patient_crm')
    .update({ patient_id: patient.id, full_name: null, phone: null, email: null, source: null })
    .eq('id', id);

  revalidatePath('/dashboard/crm');
  revalidatePath('/dashboard/patients');
}
