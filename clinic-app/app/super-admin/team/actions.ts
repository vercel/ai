'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import { log_audit_event_action } from '@/lib/audit';

export async function inviteSuperAdmin(formData: FormData) {
  const actor = await requireSuperAdmin();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('add_super_admin_by_email', { p_email: email });

  if (error) {
    redirect(`/super-admin/team?error=${encodeURIComponent(error.message)}`);
  }

  await log_audit_event_action({
    clinic_id: null,
    actor_id: actor.id,
    actor_role: 'super_admin',
    action: 'add_super_admin',
    table_name: 'super_admins',
    record_id: null,
    old_data: null,
    new_data: { email },
  });

  revalidatePath('/super-admin/team');
}
