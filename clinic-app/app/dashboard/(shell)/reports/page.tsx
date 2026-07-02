import { ReportsTabs } from './reports-tabs';
import { ReportsOverview } from '@/components/reports-overview';
import { getChurnRiskPatients, getFinancialMetrics, getProfessionalPerformance } from './actions';

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toISODate = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toISODate(start), end: toISODate(end) };
}

export default async function ReportsOverviewPage() {
  const { start, end } = monthRange();

  const [financial, performance, churnRisk] = await Promise.all([
    getFinancialMetrics(start, end),
    getProfessionalPerformance(start, end),
    getChurnRiskPatients(),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Relatórios</h1>
      <p className="mb-4 text-sm text-gray-500">Visão geral — indicadores acionáveis da clínica</p>
      <ReportsTabs />

      <ReportsOverview financial={financial} performance={performance} churnRisk={churnRisk} />
    </div>
  );
}
