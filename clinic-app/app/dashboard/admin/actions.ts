'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfile } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

export async function updateUserRole(userId: string, role: UserRole) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  await supabase.from('profiles').update({ role }).eq('id', userId);
  revalidatePath('/dashboard/admin');
}
