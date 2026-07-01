'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { LabOrderStatus } from '@/lib/types';

export async function createLabOrder(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('lab_orders').insert({
    clinic_id: profile.clinic_id,
    patient_id: String(formData.get('patient_id') ?? ''),
    professional_id: profile.id,
    exam_name: String(formData.get('exam_name') ?? ''),
  });

  if (error) {
    redirect(`/dashboard/lab-orders/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/lab-orders');
  redirect('/dashboard/lab-orders');
}

export async function updateLabOrderStatus(id: string, status: LabOrderStatus) {
  const supabase = createSupabaseServerClient();
  await supabase
    .from('lab_orders')
    .update({
      status,
      completed_at: status === 'concluido' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  revalidatePath('/dashboard/lab-orders');
}

export async function updateLabOrderResult(id: string, formData: FormData) {
  const supabase = createSupabaseServerClient();
  await supabase
    .from('lab_orders')
    .update({ result_text: String(formData.get('result_text') ?? '') || null })
    .eq('id', id);
  revalidatePath('/dashboard/lab-orders');
}

export async function deleteLabOrder(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('lab_orders').delete().eq('id', id);
  revalidatePath('/dashboard/lab-orders');
}
