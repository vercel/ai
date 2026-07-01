import { ChartsTabs } from '../charts-tabs';

export default function BudgetsChartPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Gráficos</h1>
      <p className="mb-4 text-sm text-gray-500">Orçamentos</p>
      <ChartsTabs />
      <p className="rounded bg-amber-50 p-3 text-xs text-amber-700">
        Ainda não existe um módulo de orçamentos/propostas comerciais no sistema — não há dados
        para exibir aqui. Avise se quiser que esse módulo seja criado (tabela de orçamentos com
        itens, valores e aprovação do paciente).
      </p>
    </div>
  );
}
