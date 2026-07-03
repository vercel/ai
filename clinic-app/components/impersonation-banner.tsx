import { createSupabaseServerClient } from '@/lib/supabase/server';
import { endImpersonation } from '@/app/super-admin/clinics/[id]/actions';

/**
 * Resolves the operator via auth.getUser() on purpose: requireProfile()
 * returns the impersonation *target's* profile during support mode, so the
 * session lookup here must key on the real authenticated super admin or
 * the banner (the only way out of impersonation) would vanish.
 */
export async function ImpersonationBanner() {
  const supabase = createSupabaseServerClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: session } = await supabase
    .from('impersonation_sessions')
    .select('id, clinic_id, target_user_id, started_at')
    .eq('super_admin_id', userData.user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; clinic_id: string; target_user_id: string | null; started_at: string }>();

  if (!session) return null;

  return (
    <div className="flex items-center justify-between bg-purple-700 px-6 py-2 text-sm text-white">
      <span>
        Modo suporte ativo — você está acessando como{' '}
        {session.target_user_id ? 'um profissional desta clínica' : 'esta clínica'}. Iniciado em{' '}
        {new Date(session.started_at).toLocaleTimeString('pt-BR')}.
      </span>
      <form action={endImpersonation.bind(null, session.id)}>
        <button type="submit" className="rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30">
          Encerrar impersonação
        </button>
      </form>
    </div>
  );
}
