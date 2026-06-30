import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Clinic, Plan, Profile, Subscription } from '@/lib/types';

export type ProfileWithPlan = Profile & {
  clinic: Clinic | null;
  plan: Plan | null;
  modules: string[];
  subscription: Subscription | null;
};

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

  if (profile.is_locked) {
    redirect('/suspended?reason=locked');
  }

  return profile as Profile;
}

export async function requireProfileWithPlan(): Promise<ProfileWithPlan> {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  if (!profile.clinic_id) {
    return { ...profile, clinic: null, plan: null, modules: [], subscription: null };
  }

  const [{ data: clinic }, { data: subscription }] = await Promise.all([
    supabase
      .from('clinics')
      .select('*, plans(*)')
      .eq('id', profile.clinic_id)
      .single<Clinic & { plans: Plan }>(),
    supabase
      .from('subscriptions')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .single<Subscription>(),
  ]);

  if (!clinic) {
    return { ...profile, clinic: null, plan: null, modules: [], subscription: null };
  }

  if (subscription?.status === 'suspended') {
    redirect('/suspended?reason=billing');
  }

  const { plans: plan, ...clinicFields } = clinic;
  return {
    ...profile,
    clinic: clinicFields,
    plan,
    modules: plan?.modules ?? [],
    subscription: subscription ?? null,
  };
}

export function requireAdmin(profile: Profile) {
  if (profile.role !== 'admin') {
    redirect('/dashboard');
  }
}
