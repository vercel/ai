'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

interface AuditEventParams {
  clinic_id: string | null;
  actor_id: string;
  actor_role: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

/**
 * Writes an audit log entry via the security-definer RPC function,
 * bypassing the "no direct insert" RLS policy on audit_logs.
 */
export async function log_audit_event_action(params: AuditEventParams) {
  const supabase = createSupabaseServerClient();
  await supabase.rpc('log_audit_event', {
    p_clinic_id: params.clinic_id,
    p_actor_id: params.actor_id,
    p_actor_role: params.actor_role,
    p_action: params.action,
    p_table_name: params.table_name,
    p_record_id: params.record_id,
    p_old_data: params.old_data ? JSON.stringify(params.old_data) : null,
    p_new_data: params.new_data ? JSON.stringify(params.new_data) : null,
  });
}
