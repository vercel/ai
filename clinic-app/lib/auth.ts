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

  // Support mode: when an active impersonation session targets a specific
  // user, the app sees the *target's* profile (id, role, name) so every
  // app-layer filter keyed on profile.id — minha-agenda, prontuário
  // authorship, sign buttons — mirrors the target, matching what the RLS
  // Need-to-Know policies already do via impersonated_user_id(). RLS on
  // impersonation_sessions (is_super_admin()) makes this query return
  // nothing for regular users. Anything that must identify the real
  // operator (requireSuperAdmin, ImpersonationBanner) reads auth.getUser()
  // directly and is unaffected by this override.
  const { data: impersonation } = await supabase
    .from('impersonation_sessions')
    .select('target_user_id')
    .eq('super_admin_id', userData.user.id)
    .is('ended_at', null)
    .not('target_user_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ target_user_id: string }>();

  if (impersonation?.target_user_id) {
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', impersonation.target_user_id)
      .maybeSingle();

    if (targetProfile) {
      return targetProfile as Profile;
    }
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
    modules: Array.from(new Set([...(plan?.modules ?? []), ...(clinicFields.extra_modules ?? [])])),
    subscription: subscription ?? null,
  };
}

export function requireAdmin(profile: Profile) {
  if (profile.role !== 'admin') {
    redirect('/dashboard');
  }
}
