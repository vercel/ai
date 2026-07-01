import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import { ClinicsTable, type ClinicOverviewRow } from '@/components/super-admin/clinics-table';
import { suspendClinic, activateClinic, startImpersonation } from './[id]/actions';

export default async function SuperAdminClinicsPage() {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase.rpc('super_admin_clinics_overview');
  const rows = (data ?? []) as ClinicOverviewRow[];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Clínicas</h1>
        <p className="text-sm text-slate-500">Lista completa com filtros e ações de suporte.</p>
      </div>

      <ClinicsTable
        rows={rows}
        suspendClinicAction={suspendClinic}
        activateClinicAction={activateClinic}
        startImpersonationAction={startImpersonation}
      />
    </div>
  );
}
