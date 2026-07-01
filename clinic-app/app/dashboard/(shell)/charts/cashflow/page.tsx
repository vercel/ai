import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CashAdvance, Invoice } from '@/lib/types';
import { ChartsTabs } from '../charts-tabs';

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function CashflowChartPage() {
  const supabase = createSupabaseServerClient();

  const { data: invoices } = await supabase
    .from('invoices')
    .select('amount_cents, status')
    .returns<Pick<Invoice, 'amount_cents' | 'status'>[]>();

  const { data: advances } = await supabase
    .from('cash_advances')
    .select('amount_cents, status')
    .returns<Pick<CashAdvance, 'amount_cents' | 'status'>[]>();

  const entradas = (invoices ?? [])
    .filter((i) => i.status === 'pago')
    .reduce((sum, i) => sum + i.amount_cents, 0);

  const saidas = (advances ?? [])
    .filter((a) => a.status === 'pago')
    .reduce((sum, a) => sum + a.amount_cents, 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Gráficos</h1>
      <p className="mb-4 text-sm text-gray-500">Entradas e saídas</p>
      <ChartsTabs />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Entradas (faturas pagas)</p>
          <p className="text-2xl font-semibold text-green-600">{formatCurrency(entradas)}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Saídas (Adiantamentos pagos)</p>
          <p className="text-2xl font-semibold text-red-500">{formatCurrency(saidas)}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Saldo</p>
          <p className="text-2xl font-semibold text-gray-800">
            {formatCurrency(entradas - saidas)}
          </p>
        </div>
      </div>
    </div>
  );
}
