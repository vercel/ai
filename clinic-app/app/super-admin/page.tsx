import { DollarSign, Building2, AlertTriangle, TrendingDown } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import { ClinicsTable, type ClinicOverviewRow } from '@/components/super-admin/clinics-table';
import { suspendClinic, activateClinic, startImpersonation } from './clinics/[id]/actions';

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function SuperAdminPage() {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase.rpc('super_admin_clinics_overview');
  const rows = (data ?? []) as ClinicOverviewRow[];

  const activeRows = rows.filter((r) => r.subscription_status === 'active' || r.subscription_status === 'trialing');
  const pastDueRows = rows.filter((r) => r.subscription_status === 'past_due' || r.subscription_status === 'suspended');
  const mrr = activeRows.reduce((sum, r) => sum + (r.price_cents ?? 0), 0);

  // Simplified 30-day churn: canceled subscriptions in the window over the
  // clinics that were still "at risk of churning" during that window
  // (currently active/trialing + the ones that just churned).
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const recentlyCanceled = rows.filter(
    (r) =>
      r.subscription_status === 'canceled' &&
      r.subscription_updated_at &&
      Date.now() - new Date(r.subscription_updated_at).getTime() < THIRTY_DAYS_MS,
  );
  const churnBase = activeRows.length + recentlyCanceled.length;
  const churnRate = churnBase > 0 ? (recentlyCanceled.length / churnBase) * 100 : 0;

  const metrics = [
    {
      label: 'MRR',
      value: formatBRL(mrr),
      icon: DollarSign,
      accent: 'text-emerald-400 bg-emerald-500/10',
    },
    {
      label: 'Clínicas ativas',
      value: String(activeRows.length),
      icon: Building2,
      accent: 'text-blue-400 bg-blue-500/10',
    },
    {
      label: 'Clínicas inadimplentes',
      value: String(pastDueRows.length),
      icon: AlertTriangle,
      accent: 'text-amber-400 bg-amber-500/10',
    },
    {
      label: 'Taxa de churn (30d)',
      value: `${churnRate.toFixed(1)}%`,
      icon: TrendingDown,
      accent: 'text-red-400 bg-red-500/10',
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Visão geral da plataforma</h1>
        <p className="text-sm text-slate-500">Saúde financeira e operacional de todas as clínicas.</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl border border-white/5 bg-slate-900/60 p-5">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${m.accent}`}>
              <m.icon className="h-4.5 w-4.5" />
            </div>
            <p className="text-xs text-slate-500">{m.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{m.value}</p>
          </div>
        ))}
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
