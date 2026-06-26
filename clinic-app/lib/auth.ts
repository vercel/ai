import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

export async function requireProfile(): Promise<Profile> {
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .single();

  if (!profile) {
    redirect('/login');
  }

  return profile as Profile;
}

export function requireAdmin(profile: Profile) {
  if (profile.role !== 'admin') {
    redirect('/dashboard');
  }
}
