import { createSupabaseServerClient } from '@/lib/supabase/server';
import { endImpersonation } from '@/app/super-admin/clinics/[id]/actions';

export async function ImpersonationBanner({ actorId }: { actorId: string }) {
  const supabase = createSupabaseServerClient();

  // Check if this user is a super admin with an active impersonation session
  const { data: session } = await supabase
    .from('impersonation_sessions')
    .select('id, clinic_id, started_at')
    .eq('super_admin_id', actorId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; clinic_id: string; started_at: string }>();

  if (!session) return null;

  // Get super admin's own original clinic (from super_admins we don't store it, but we need it)
  // The original clinic_id is stored in audit_logs; for simplicity store it in a cookie via the action
  // For now, just end with null (super admin may not have a clinic)
  return (
    <div className="flex items-center justify-between bg-purple-700 px-6 py-2 text-sm text-white">
      <span>
        Modo suporte ativo — você está acessando como esta clínica.
        Iniciado em {new Date(session.started_at).toLocaleTimeString('pt-BR')}.
      </span>
      <form action={endImpersonation.bind(null, session.id)}>
        <button type="submit" className="rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30">
          Encerrar impersonação
        </button>
      </form>
    </div>
  );
}
