import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Patient, Product, Sale } from '@/lib/types';
import { DeleteProductButton } from '@/components/delete-product-button';
import { StoreTabs } from '../store-tabs';
import { sellProduct } from './actions';

type SaleRow = Sale & { products: Pick<Product, 'name'> };

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function StorePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const [{ data: products }, { data: patients }, { data: sales }] = await Promise.all([
    supabase.from('products').select('*').order('name').returns<Product[]>(),
    supabase.from('patients').select('id, full_name').order('full_name').returns<Patient[]>(),
    supabase
      .from('sales')
      .select('*, products(name)')
      .order('sold_at', { ascending: false })
      .limit(10)
      .returns<SaleRow[]>(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Produtos</h1>
        <Link
          href="/dashboard/store/products/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Novo produto
        </Link>
      </div>

      <StoreTabs />

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Produtos</h2>
          <div className="flex flex-col gap-3">
            {(products ?? []).map((product) => (
              <div key={product.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{product.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(product.price_cents)} · estoque: {product.stock}
                    </p>
                  </div>
                  <DeleteProductButton id={product.id} />
                </div>
                {product.stock > 0 && (
                  <form action={sellProduct} className="flex items-end gap-2">
                    <input type="hidden" name="product_id" value={product.id} />
                    <label className="text-xs text-gray-500">
                      Qtd
                      <input
                        name="quantity"
                        type="number"
                        min="1"
                        max={product.stock}
                        defaultValue={1}
                        className="mt-1 w-16 rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="flex-1 text-xs text-gray-500">
                      Paciente (opcional)
                      <select
                        name="patient_id"
                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="">-</option>
                        {(patients ?? []).map((patient) => (
                          <option key={patient.id} value={patient.id}>
                            {patient.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                    >
                      Vender
                    </button>
                  </form>
                )}
              </div>
            ))}
            {(products ?? []).length === 0 && (
              <p className="text-sm text-gray-400">Nenhum produto cadastrado ainda.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Vendas recentes</h2>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Qtd</th>
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {(sales ?? []).map((sale) => (
                  <tr key={sale.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-700">{sale.products?.name}</td>
                    <td className="px-4 py-3 text-gray-500">{sale.quantity}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatCurrency(sale.total_cents)}
                    </td>
                  </tr>
                ))}
                {(sales ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                      Nenhuma venda registrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
