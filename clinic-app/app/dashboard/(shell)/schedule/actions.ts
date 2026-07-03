'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function addAvailability(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  await supabase.from('availability').insert({
    professional_id: profile.id,
    weekday: Number(formData.get('weekday') ?? 0),
    start_time: String(formData.get('start_time') ?? ''),
    end_time: String(formData.get('end_time') ?? ''),
  });

  revalidatePath('/dashboard/schedule');
}

export async function deleteAvailability(id: string) {
  await requireProfile();
  const supabase = createSupabaseServerClient();
  await supabase.from('availability').delete().eq('id', id);
  revalidatePath('/dashboard/schedule');
}
