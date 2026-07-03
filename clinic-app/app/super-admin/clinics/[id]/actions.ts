'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import { log_audit_event_action } from '@/lib/audit';

/**
 * The one place that flips a clinic between suspended (Hard-Block, manual
 * only) and active. Suspending sets a billing_alert_message so the reason
 * survives into the /suspended page and the (now redundant, but harmless)
 * dashboard banner; activating clears it along with past_due_since.
 */
export async function toggleClinicSuspension(clinicId: string, isSuspended: boolean) {
  const actor = await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const status = isSuspended ? 'suspended' : 'active';
  const subscriptionUpdate = isSuspended
    ? {
        status,
        billing_alert_message:
          'Acesso suspenso pelo suporte por inadimplência. Regularize o pagamento para reativar.',
      }
    : { status, billing_alert_message: null, past_due_since: null };

  await Promise.all([
    supabase.from('clinics').update({ is_active: !isSuspended }).eq('id', clinicId),
    supabase.from('subscriptions').update(subscriptionUpdate).eq('clinic_id', clinicId),
  ]);

  await log_audit_event_action({
    clinic_id: clinicId,
    actor_id: actor.id,
    actor_role: 'super_admin',
    action: isSuspended ? 'suspend_clinic' : 'activate_clinic',
    table_name: 'clinics',
    record_id: clinicId,
    old_data: { is_active: !isSuspended },
    new_data: { is_active: isSuspended, subscription_status: status },
  });

  revalidatePath(`/super-admin/clinics/${clinicId}`);
  revalidatePath('/super-admin');
  revalidatePath('/super-admin/clinics');
}

export async function suspendClinic(clinicId: string) {
  await toggleClinicSuspension(clinicId, true);
}

export async function activateClinic(clinicId: string) {
  await toggleClinicSuspension(clinicId, false);
}

/**
 * Toggles an opt-in "differential" module (e.g. 'store') for a single
 * clinic, independent of its plan tier — used to trial/enable a feature for
 * one interested customer without changing what every other clinic sees.
 */
export async function toggleClinicModule(clinicId: string, moduleName: string, enabled: boolean) {
  const actor = await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data: clinic } = await supabase
    .from('clinics')
    .select('extra_modules')
    .eq('id', clinicId)
    .single<{ extra_modules: string[] }>();

  const current = clinic?.extra_modules ?? [];
  const next = enabled
    ? Array.from(new Set([...current, moduleName]))
    : current.filter((m) => m !== moduleName);

  await supabase.from('clinics').update({ extra_modules: next }).eq('id', clinicId);

  await log_audit_event_action({
    clinic_id: clinicId,
    actor_id: actor.id,
    actor_role: 'super_admin',
    action: enabled ? 'enable_clinic_module' : 'disable_clinic_module',
    table_name: 'clinics',
    record_id: clinicId,
    old_data: { extra_modules: current },
    new_data: { extra_modules: next },
  });

  revalidatePath(`/super-admin/clinics/${clinicId}`);
}

export async function changePlanSuperAdmin(clinicId: string, formData: FormData) {
  const actor = await requireSuperAdmin();
  const newPlanId = String(formData.get('plan_id') ?? '');

  const supabase = createSupabaseServerClient();
  const { data: plan } = await supabase
    .from('plans')
    .select('name')
    .eq('id', newPlanId)
    .single<{ name: string }>();

  await Promise.all([
    supabase.from('clinics').update({ plan_id: newPlanId }).eq('id', clinicId),
    supabase.from('subscriptions').update({ plan_id: newPlanId }).eq('clinic_id', clinicId),
  ]);

  await log_audit_event_action({
    clinic_id: clinicId,
    actor_id: actor.id,
    actor_role: 'super_admin',
    action: 'change_plan',
    table_name: 'clinics',
    record_id: clinicId,
    old_data: null,
    new_data: { plan: plan?.name },
  });

  revalidatePath(`/super-admin/clinics/${clinicId}`);
}

/**
 * Impersonate: temporarily set this super admin's profiles.clinic_id to the
 * target clinic, record the session, redirect to /dashboard.
 */
export async function startImpersonation(clinicId: string, formData: FormData) {
  const actor = await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const reason = String(formData.get('reason') ?? '').trim() || 'Suporte técnico';

  // Get current clinic_id/role to restore later
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', actor.id)
    .single<{ clinic_id: string | null; role: string }>();

  // Create impersonation session
  const { data: session } = await supabase
    .from('impersonation_sessions')
    .insert({
      super_admin_id: actor.id,
      clinic_id: clinicId,
      original_clinic_id: profile?.clinic_id,
      original_role: profile?.role,
      reason,
    })
    .select('id')
    .single<{ id: string }>();

  // Temporarily set admin's clinic_id to the target clinic
  await supabase
    .from('profiles')
    .update({ clinic_id: clinicId })
    .eq('id', actor.id);

  await log_audit_event_action({
    clinic_id: clinicId,
    actor_id: actor.id,
    actor_role: 'super_admin',
    action: 'impersonate_start',
    table_name: 'impersonation_sessions',
    record_id: session?.id ?? null,
    old_data: { original_clinic_id: profile?.clinic_id },
    new_data: { impersonating_clinic_id: clinicId, reason },
  });

  redirect('/dashboard');
}

/**
 * Impersonate a specific team member (professional/reception) rather than
 * the clinic in general. Mutates this super admin's own clinic_id AND role
 * to mirror the target — current_clinic_id()/is_admin() then read correctly
 * for clinic-wide RLS, and the Need-to-Know policies (patients,
 * medical_records, medical_certificates) resolve professional_id via
 * impersonated_user_id(), which looks up target_user_id on this session.
 * There's no real auth session swap (no service-role key available), so
 * app-layer queries filtered by the caller's own id (e.g. "Meus
 * Atendimentos") won't reflect the target — only RLS-gated reads do.
 */
export async function impersonateUser(clinicId: string, userId: string, formData: FormData) {
  const actor = await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const reason = String(formData.get('reason') ?? '').trim() || 'Suporte técnico';

  const [{ data: actorProfile }, { data: targetProfile }] = await Promise.all([
    supabase.from('profiles').select('clinic_id, role').eq('id', actor.id).single<{
      clinic_id: string | null;
      role: string;
    }>(),
    supabase.from('profiles').select('role, full_name').eq('id', userId).eq('clinic_id', clinicId).single<{
      role: string;
      full_name: string;
    }>(),
  ]);

  if (!targetProfile) {
    redirect(`/super-admin/clinics/${clinicId}?error=Profissional não encontrado`);
  }

  const { data: session } = await supabase
    .from('impersonation_sessions')
    .insert({
      super_admin_id: actor.id,
      clinic_id: clinicId,
      original_clinic_id: actorProfile?.clinic_id,
      original_role: actorProfile?.role,
      target_user_id: userId,
      target_role: targetProfile.role,
      reason,
    })
    .select('id')
    .single<{ id: string }>();

  await supabase
    .from('profiles')
    .update({ clinic_id: clinicId, role: targetProfile.role })
    .eq('id', actor.id);

  await log_audit_event_action({
    clinic_id: clinicId,
    actor_id: actor.id,
    actor_role: 'super_admin',
    action: 'impersonate_user_start',
    table_name: 'impersonation_sessions',
    record_id: session?.id ?? null,
    old_data: { original_clinic_id: actorProfile?.clinic_id, original_role: actorProfile?.role },
    new_data: { target_user_id: userId, target_full_name: targetProfile.full_name, target_role: targetProfile.role, reason },
  });

  redirect('/dashboard');
}

/**
 * End impersonation: restore the super admin's original clinic_id (and role,
 * if a specific user was being impersonated) from the session record.
 */
export async function endImpersonation(sessionId: string) {
  const actor = await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data: session } = await supabase
    .from('impersonation_sessions')
    .select('original_clinic_id, original_role')
    .eq('id', sessionId)
    .single<{ original_clinic_id: string | null; original_role: string | null }>();

  await supabase
    .from('profiles')
    .update({
      clinic_id: session?.original_clinic_id ?? null,
      ...(session?.original_role ? { role: session.original_role } : {}),
    })
    .eq('id', actor.id);

  await supabase
    .from('impersonation_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId);

  await log_audit_event_action({
    clinic_id: null,
    actor_id: actor.id,
    actor_role: 'super_admin',
    action: 'impersonate_end',
    table_name: 'impersonation_sessions',
    record_id: sessionId,
    old_data: null,
    new_data: { restored_clinic_id: session?.original_clinic_id ?? null },
  });

  redirect('/super-admin');
}

/**
 * Read-only preview: mints a patient portal magic-link token without
 * touching the caller's own session/clinic_id, then returns the path for
 * the client to open in a new tab.
 */
export async function getPatientPortalLinkSuperAdmin(patientId: string) {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data: token, error } = await supabase.rpc('create_patient_portal_token_as_super_admin', {
    p_patient_id: patientId,
    p_days: 1,
  });

  if (error || !token) {
    return null;
  }

  return `/p/${token}`;
}
