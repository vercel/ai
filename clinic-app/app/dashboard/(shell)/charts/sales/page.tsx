import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Product, Sale } from '@/lib/types';
import { ChartsTabs } from '../charts-tabs';
import { BarList } from '@/components/bar-list';

type SaleRow = Pick<Sale, 'quantity' | 'total_cents'> & { products: Pick<Product, 'name'> };

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function SalesChartPage() {
  const supabase = createSupabaseServerClient();
  const { data: sales } = await supabase
    .from('sales')
    .select('quantity, total_cents, products(name)')
    .returns<SaleRow[]>();

  const rows = sales ?? [];
  const totalRevenue = rows.reduce((sum, s) => sum + s.total_cents, 0);
  const totalItems = rows.reduce((sum, s) => sum + s.quantity, 0);

  const byProduct = rows.reduce<Record<string, number>>((acc, s) => {
    const name = s.products?.name ?? 'Produto';
    acc[name] = (acc[name] ?? 0) + s.quantity;
    return acc;
  }, {});

  const items = Object.entries(byProduct).map(([label, value]) => ({ label, value }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Gráficos</h1>
      <p className="mb-4 text-sm text-gray-500">Vendas (Loja)</p>
      <ChartsTabs />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Receita total</p>
          <p className="text-2xl font-semibold text-gray-800">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Itens vendidos</p>
          <p className="text-2xl font-semibold text-gray-800">{totalItems}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Por produto</h2>
        <BarList items={items} />
      </div>
    </div>
  );
}
