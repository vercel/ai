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

const CRM_STAGES = [
  'Contato Inicial',
  'Agendado',
  'Atendido',
  'Em acompanhamento',
  'Aguardando Retorno',
  'Fidelizado',
] as const;

export async function addPatientToCrm(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const patientId = String(formData.get('patient_id') ?? '');
  if (!patientId) return;

  await supabase.from('patient_crm').insert({
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
