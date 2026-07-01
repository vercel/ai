'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import { log_audit_event_action } from '@/lib/audit';

export async function suspendClinic(clinicId: string) {
  const actor = await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  await Promise.all([
    supabase.from('clinics').update({ is_active: false }).eq('id', clinicId),
    supabase.from('subscriptions').update({ status: 'suspended' }).eq('clinic_id', clinicId),
  ]);

  await log_audit_event_action({
    clinic_id: clinicId,
    actor_id: actor.id,
    actor_role: 'super_admin',
    action: 'suspend_clinic',
    table_name: 'clinics',
    record_id: clinicId,
    old_data: { is_active: true },
    new_data: { is_active: false, subscription_status: 'suspended' },
  });

  revalidatePath(`/super-admin/clinics/${clinicId}`);
  revalidatePath('/super-admin');
  revalidatePath('/super-admin/clinics');
}

export async function activateClinic(clinicId: string) {
  const actor = await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  await Promise.all([
    supabase.from('clinics').update({ is_active: true }).eq('id', clinicId),
    supabase.from('subscriptions').update({ status: 'active', past_due_since: null }).eq('clinic_id', clinicId),
  ]);

  await log_audit_event_action({
    clinic_id: clinicId,
    actor_id: actor.id,
    actor_role: 'super_admin',
    action: 'activate_clinic',
    table_name: 'clinics',
    record_id: clinicId,
    old_data: { is_active: false },
    new_data: { is_active: true, subscription_status: 'active' },
  });

  revalidatePath(`/super-admin/clinics/${clinicId}`);
  revalidatePath('/super-admin');
  revalidatePath('/super-admin/clinics');
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

  // Get current clinic_id to restore later
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', actor.id)
    .single<{ clinic_id: string | null }>();

  // Create impersonation session
  const { data: session } = await supabase
    .from('impersonation_sessions')
    .insert({
      super_admin_id: actor.id,
      clinic_id: clinicId,
      original_clinic_id: profile?.clinic_id,
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
 * End impersonation: restore the super admin's original clinic_id from the session record.
 */
export async function endImpersonation(sessionId: string) {
  const actor = await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data: session } = await supabase
    .from('impersonation_sessions')
    .select('original_clinic_id')
    .eq('id', sessionId)
    .single<{ original_clinic_id: string | null }>();

  await supabase
    .from('profiles')
    .update({ clinic_id: session?.original_clinic_id ?? null })
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
