'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfileWithPlan } from '@/lib/auth';
import { log_audit_event_action } from '@/lib/audit';
import type { Profile } from '@/lib/types';

/**
 * Change clinic plan.
 * If the new plan has fewer seats than current active users, sets pending_plan_id
 * and redirects to the user-selection step instead of applying immediately.
 */
export async function changePlan(formData: FormData) {
  const profile = await requireProfileWithPlan();
  requireAdmin(profile);

  const newPlanId = String(formData.get('plan_id') ?? '');
  if (!newPlanId || !profile.clinic_id) {
    redirect('/dashboard/admin/subscription?error=Plano inválido');
  }

  const supabase = createSupabaseServerClient();

  const { data: newPlan } = await supabase
    .from('plans')
    .select('id, name, max_users')
    .eq('id', newPlanId)
    .single<{ id: string; name: string; max_users: number | null }>();

  if (!newPlan) {
    redirect('/dashboard/admin/subscription?error=Plano não encontrado');
  }

  // Count active (non-locked) users in this clinic
  const { count: activeCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', profile.clinic_id)
    .eq('is_locked', false);

  const total = activeCount ?? 0;
  const maxUsers = newPlan.max_users;

  if (maxUsers !== null && total > maxUsers) {
    // Need to lock excess users — store pending plan and redirect to user selection
    await supabase
      .from('subscriptions')
      .update({ pending_plan_id: newPlanId })
      .eq('clinic_id', profile.clinic_id);

    redirect(`/dashboard/admin/subscription/downgrade?plan_id=${newPlanId}&keep=${maxUsers}`);
  }

  // Apply plan change immediately
  await Promise.all([
    supabase.from('clinics').update({ plan_id: newPlanId }).eq('id', profile.clinic_id),
    supabase
      .from('subscriptions')
      .update({ plan_id: newPlanId, status: 'active', pending_plan_id: null })
      .eq('clinic_id', profile.clinic_id),
  ]);

  await log_audit_event_action({
    clinic_id: profile.clinic_id,
    actor_id: profile.id,
    actor_role: profile.role,
    action: 'plan_change',
    table_name: 'subscriptions',
    record_id: null,
    old_data: { plan: profile.plan?.name },
    new_data: { plan: newPlan.name },
  });

  revalidatePath('/dashboard/admin/subscription');
  redirect('/dashboard/admin/subscription?success=Plano alterado com sucesso');
}

/**
 * Apply downgrade after admin selected which users to keep.
 * Locks all users NOT in the keep list, then applies the pending plan.
 */
export async function applyDowngrade(formData: FormData) {
  const profile = await requireProfileWithPlan();
  requireAdmin(profile);

  if (!profile.clinic_id) redirect('/dashboard/admin/subscription');

  const supabase = createSupabaseServerClient();

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('pending_plan_id')
    .eq('clinic_id', profile.clinic_id)
    .single<{ pending_plan_id: string | null }>();

  const newPlanId = sub?.pending_plan_id;
  if (!newPlanId) redirect('/dashboard/admin/subscription?error=Nenhum plano pendente');

  // keepIds = user ids admin chose to keep active
  const keepIds = formData.getAll('keep_user_id').map(String);

  // Get all active users for this clinic
  const { data: allUsers } = await supabase
    .from('profiles')
    .select('id')
    .eq('clinic_id', profile.clinic_id)
    .eq('is_locked', false)
    .returns<{ id: string }[]>();

  const lockIds = (allUsers ?? []).map((u) => u.id).filter((id) => !keepIds.includes(id));

  // Lock the excess users
  if (lockIds.length > 0) {
    await supabase.from('profiles').update({ is_locked: true }).in('id', lockIds);
  }

  // Apply plan change
  const { data: newPlan } = await supabase
    .from('plans')
    .select('name')
    .eq('id', newPlanId)
    .single<{ name: string }>();

  await Promise.all([
    supabase.from('clinics').update({ plan_id: newPlanId }).eq('id', profile.clinic_id),
    supabase
      .from('subscriptions')
      .update({ plan_id: newPlanId, status: 'active', pending_plan_id: null })
      .eq('clinic_id', profile.clinic_id),
  ]);

  await log_audit_event_action({
    clinic_id: profile.clinic_id,
    actor_id: profile.id,
    actor_role: profile.role,
    action: 'downgrade_lock',
    table_name: 'subscriptions',
    record_id: null,
    old_data: { plan: profile.plan?.name, locked_users: lockIds },
    new_data: { plan: newPlan?.name, kept_users: keepIds },
  });

  revalidatePath('/dashboard/admin/subscription');
  redirect('/dashboard/admin/subscription?success=Downgrade aplicado. Usuários excedentes foram bloqueados.');
}

/**
 * Reactivate a locked user (after upgrading to a plan with enough seats).
 */
export async function unlockUser(userId: string) {
  const profile = await requireProfileWithPlan();
  requireAdmin(profile);

  if (!profile.clinic_id) return;

  const supabase = createSupabaseServerClient();

  const maxUsers = profile.plan?.max_users ?? null;
  if (maxUsers !== null) {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', profile.clinic_id)
      .eq('is_locked', false);
    if ((count ?? 0) >= maxUsers) {
      redirect('/dashboard/admin/subscription?error=Limite de usuários atingido. Faça upgrade primeiro.');
    }
  }

  await supabase.from('profiles').update({ is_locked: false }).eq('id', userId);

  revalidatePath('/dashboard/admin/subscription');
}

/**
 * LGPD data portability: request a consolidated export of every record
 * belonging to this clinic. Creates a "processing" row and invokes the
 * export-clinic-data Edge Function, which uploads a signed manifest and
 * flips the row to "ready" (or "failed").
 */
export async function exportClinicData() {
  const profile = await requireProfileWithPlan();
  requireAdmin(profile);
  if (!profile.clinic_id) return;

  const supabase = createSupabaseServerClient();

  await supabase.from('data_exports').insert({
    clinic_id: profile.clinic_id,
    requested_by: profile.id,
    reason: 'manual',
    status: 'processing',
  });

  await fetch(`${process.env.SUPABASE_FUNCTIONS_URL}/export-clinic-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_FUNCTIONS_SECRET ?? '',
    },
    body: JSON.stringify({ clinic_id: profile.clinic_id, reason: 'manual' }),
  });

  await log_audit_event_action({
    clinic_id: profile.clinic_id,
    actor_id: profile.id,
    actor_role: profile.role,
    action: 'request_data_export',
    table_name: 'data_exports',
    record_id: null,
    old_data: null,
    new_data: null,
  });

  revalidatePath('/dashboard/admin/subscription');
}
