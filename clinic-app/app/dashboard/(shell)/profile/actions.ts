'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function updateProfile(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const fullName = String(formData.get('full_name') ?? '');
  const newPassword = String(formData.get('password') ?? '');

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', profile.id);

  if (profileError) {
    redirect(`/dashboard/profile?error=${encodeURIComponent(profileError.message)}`);
  }

  if (newPassword) {
    // During impersonation requireProfile() returns the target's profile,
    // but auth.updateUser always hits the real authenticated account — a
    // support operator "changing the professional's password" would in fact
    // change their own super admin password. Block that combination.
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user?.id !== profile.id) {
      redirect(
        `/dashboard/profile?error=${encodeURIComponent('Troca de senha indisponível em modo suporte')}`,
      );
    }

    const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
    if (passwordError) {
      redirect(`/dashboard/profile?error=${encodeURIComponent(passwordError.message)}`);
    }
  }

  revalidatePath('/dashboard/profile');
  redirect('/dashboard/profile?success=1');
}
