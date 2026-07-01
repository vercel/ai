import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { ReportsTabs } from './reports-tabs';
import { ReportsOverview, type ChurnRiskPatient, type ProfessionalPerformance } from '@/components/reports-overview';

interface FinancialMetrics {
  total_revenue_cents: number;
  average_ticket_cents: number;
  default_rate: number;
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toISODate = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toISODate(start), end: toISODate(end) };
}

export default async function ReportsOverviewPage() {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  if (!profile.clinic_id) {
    return null;
  }

  const { start, end } = monthRange();

  const [
    { data: metrics },
    { data: performance },
    { data: churnRisk },
    { count: appointmentsThisMonth },
    { count: noShowThisMonth },
  ] = await Promise.all([
    supabase.rpc('get_clinic_financial_metrics', {
      p_clinic_id: profile.clinic_id,
      p_start_date: start,
      p_end_date: end,
    }),
    supabase.rpc('get_professional_performance', { p_clinic_id: profile.clinic_id }),
    supabase.rpc('get_churn_risk_patients', { p_clinic_id: profile.clinic_id }),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .gte('scheduled_at', start)
      .lte('scheduled_at', `${end}T23:59:59`),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .gte('scheduled_at', start)
      .lte('scheduled_at', `${end}T23:59:59`)
      .eq('status', 'no_show'),
  ]);

  const financial = (metrics ?? {
    total_revenue_cents: 0,
    average_ticket_cents: 0,
    default_rate: 0,
  }) as FinancialMetrics;

  const noShowRate =
    appointmentsThisMonth && appointmentsThisMonth > 0
      ? Math.round(((noShowThisMonth ?? 0) / appointmentsThisMonth) * 1000) / 10
      : 0;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Relatórios</h1>
      <p className="mb-4 text-sm text-gray-500">Visão geral — indicadores acionáveis da clínica</p>
      <ReportsTabs />

      <ReportsOverview
        financial={financial}
        appointmentsThisMonth={appointmentsThisMonth ?? 0}
        noShowRate={noShowRate}
        performance={(performance ?? []) as ProfessionalPerformance[]}
        churnRisk={(churnRisk ?? []) as ChurnRiskPatient[]}
      />
    </div>
  );
}
