import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function requireSuperAdmin() {
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  const { data: sa } = await supabase
    .from('super_admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .single<{ user_id: string }>();

  if (!sa) {
    redirect('/dashboard');
  }

  return userData.user;
}
