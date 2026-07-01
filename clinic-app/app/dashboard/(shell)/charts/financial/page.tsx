import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Invoice } from '@/lib/types';
import { ChartsTabs } from '../charts-tabs';
import { BarList } from '@/components/bar-list';

function monthKey(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function FinancialChartPage() {
  const supabase = createSupabaseServerClient();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('amount_cents, status, paid_at, created_at')
    .returns<Pick<Invoice, 'amount_cents' | 'status' | 'paid_at' | 'created_at'>[]>();

  const rows = invoices ?? [];
  const totalReceived = rows
    .filter((i) => i.status === 'pago')
    .reduce((sum, i) => sum + i.amount_cents, 0);
  const totalPending = rows
    .filter((i) => i.status === 'pendente')
    .reduce((sum, i) => sum + i.amount_cents, 0);

  const byMonth = rows
    .filter((i) => i.status === 'pago' && i.paid_at)
    .reduce<Record<string, number>>((acc, i) => {
      const key = monthKey(i.paid_at!);
      acc[key] = (acc[key] ?? 0) + i.amount_cents / 100;
      return acc;
    }, {});

  const items = Object.entries(byMonth).map(([label, value]) => ({
    label,
    value: Math.round(value),
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Gráficos</h1>
      <p className="mb-4 text-sm text-gray-500">Painel financeiro (beta)</p>
      <ChartsTabs />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Recebido</p>
          <p className="text-2xl font-semibold text-gray-800">{formatCurrency(totalReceived)}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Pendente</p>
          <p className="text-2xl font-semibold text-gray-800">{formatCurrency(totalPending)}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Recebido por mês (R$)</h2>
        <BarList items={items} />
      </div>
    </div>
  );
}
