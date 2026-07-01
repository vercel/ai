import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import { ClinicsTable, type ClinicOverviewRow } from '@/components/super-admin/clinics-table';
import { suspendClinic, activateClinic, startImpersonation } from './[id]/actions';

export default async function SuperAdminClinicsPage({
  searchParams,
}: {
  searchParams: { success?: string };
}) {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase.rpc('super_admin_clinics_overview');
  const rows = (data ?? []) as ClinicOverviewRow[];

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Clínicas</h1>
          <p className="text-sm text-slate-500">Lista completa com filtros e ações de suporte.</p>
        </div>
        <Link
          href="/super-admin/clinics/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          Adicionar clínica
        </Link>
      </div>

      {searchParams.success && (
        <p className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
          {searchParams.success}
        </p>
      )}

      <ClinicsTable
        rows={rows}
        suspendClinicAction={suspendClinic}
        activateClinicAction={activateClinic}
        startImpersonationAction={startImpersonation}
      />
    </div>
  );
}
