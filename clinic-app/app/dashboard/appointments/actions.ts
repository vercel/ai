'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AppointmentStatus } from '@/lib/types';

export async function createAppointment(formData: FormData) {
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('appointments').insert({
    patient_id: String(formData.get('patient_id') ?? ''),
    professional_id: String(formData.get('professional_id') ?? ''),
    scheduled_at: new Date(String(formData.get('scheduled_at') ?? '')).toISOString(),
    duration_minutes: Number(formData.get('duration_minutes') ?? 30),
    notes: String(formData.get('notes') ?? '') || null,
  });

  if (error) {
    redirect(`/dashboard/appointments/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/appointments');
  redirect('/dashboard/appointments');
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  const supabase = createSupabaseServerClient();
  await supabase.from('appointments').update({ status }).eq('id', id);
  revalidatePath('/dashboard/appointments');
}
