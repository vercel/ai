'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { Appointment } from '@/lib/types';

export async function startAttendance(appointmentId: string) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: appointment } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single<Appointment>();

  if (!appointment || appointment.professional_id !== profile.id) {
    redirect('/dashboard/minha-agenda');
  }

  await supabase
    .from('appointments')
    .update({ status: 'in_progress' })
    .eq('id', appointmentId)
    .eq('professional_id', profile.id);

  revalidatePath(`/dashboard/minha-agenda/${appointmentId}`);
}

/**
 * Records an exam/image already uploaded (client-side, RLS-gated) to the
 * private clinical-records bucket. Storage RLS already restricted the
 * upload to the appointment's own professional; this just persists the
 * metadata row so it shows up in the attendance screen.
 */
export async function addAppointmentAttachment(
  appointmentId: string,
  patientId: string,
  fileUrl: string,
  fileName: string,
) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  await supabase.from('appointment_attachments').insert({
    clinic_id: profile.clinic_id,
    appointment_id: appointmentId,
    patient_id: patientId,
    professional_id: profile.id,
    file_url: fileUrl,
    file_name: fileName,
  });

  revalidatePath(`/dashboard/minha-agenda/${appointmentId}`);
}

export async function deleteAppointmentAttachment(appointmentId: string, attachmentId: string) {
  await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: attachment } = await supabase
    .from('appointment_attachments')
    .select('file_url')
    .eq('id', attachmentId)
    .single<{ file_url: string }>();

  await supabase.from('appointment_attachments').delete().eq('id', attachmentId);
  if (attachment) {
    await supabase.storage.from('clinical-records').remove([attachment.file_url]);
  }

  revalidatePath(`/dashboard/minha-agenda/${appointmentId}`);
}

/**
 * Never expose the private bucket's real URL to the UI — mint a
 * short-lived signed URL on demand instead.
 */
export async function getAppointmentAttachmentSignedUrl(fileUrl: string) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.storage.from('clinical-records').createSignedUrl(fileUrl, 60);
  return data?.signedUrl ?? null;
}
