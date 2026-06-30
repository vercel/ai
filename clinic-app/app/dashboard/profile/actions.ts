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
    const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
    if (passwordError) {
      redirect(`/dashboard/profile?error=${encodeURIComponent(passwordError.message)}`);
    }
  }

  revalidatePath('/dashboard/profile');
  redirect('/dashboard/profile?success=1');
}
