'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { AppointmentStatus } from '@/lib/types';

export async function createAppointment(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('appointments').insert({
    clinic_id: profile.clinic_id,
    patient_id: String(formData.get('patient_id') ?? ''),
    professional_id: String(formData.get('professional_id') ?? ''),
    room_id: String(formData.get('room_id') ?? '') || null,
    appointment_type: String(formData.get('appointment_type') ?? '') || null,
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

export async function updateAppointment(id: string, formData: FormData) {
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from('appointments')
    .update({
      patient_id: String(formData.get('patient_id') ?? ''),
      professional_id: String(formData.get('professional_id') ?? ''),
      room_id: String(formData.get('room_id') ?? '') || null,
      appointment_type: String(formData.get('appointment_type') ?? '') || null,
      scheduled_at: new Date(String(formData.get('scheduled_at') ?? '')).toISOString(),
      duration_minutes: Number(formData.get('duration_minutes') ?? 30),
      status: String(formData.get('status') ?? 'agendado') as AppointmentStatus,
      notes: String(formData.get('notes') ?? '') || null,
    })
    .eq('id', id);

  if (error) {
    redirect(`/dashboard/appointments/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/appointments');
  redirect('/dashboard/appointments');
}

export async function deleteAppointment(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('appointments').delete().eq('id', id);
  revalidatePath('/dashboard/appointments');
}
