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
