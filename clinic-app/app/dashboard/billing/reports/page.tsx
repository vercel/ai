import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Invoice, Patient } from '@/lib/types';

type InvoiceRow = Invoice & { patients: Pick<Patient, 'full_name'> };

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function BillingReportsPage() {
  const supabase = createSupabaseServerClient();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, patients(full_name)')
    .order('created_at', { ascending: false })
    .returns<InvoiceRow[]>();

  const all = invoices ?? [];
  const paid = all.filter((i) => i.status === 'pago');
  const overdue = all.filter(
    (i) => i.status === 'pendente' && i.due_date && new Date(i.due_date) < new Date(),
  );
  const pending = all.filter((i) => i.status === 'pendente');

  const totalRevenue = paid.reduce((sum, i) => sum + i.amount_cents, 0);
  const totalPending = pending.reduce((sum, i) => sum + i.amount_cents, 0);
  const totalOverdue = overdue.reduce((sum, i) => sum + i.amount_cents, 0);

  const revenueByMonth = new Map<string, number>();
  for (const invoice of paid) {
    if (!invoice.paid_at) continue;
    const key = new Date(invoice.paid_at).toLocaleDateString('pt-BR', {
      month: 'short',
      year: 'numeric',
    });
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + invoice.amount_cents);
  }
  const months = Array.from(revenueByMonth.entries()).slice(-6);
  const maxRevenue = Math.max(...months.map(([, v]) => v), 1);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Relatórios financeiros</h1>
        <Link href="/dashboard/billing" className="text-sm text-brand-600 hover:underline">
          Voltar
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Receita recebida</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">
            {formatCurrency(totalRevenue)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Pendente</p>
          <p className="mt-1 text-2xl font-semibold text-gray-700">
            {formatCurrency(totalPending)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Inadimplência (vencidas)</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">
            {formatCurrency(totalOverdue)}
          </p>
        </div>
      </div>

      <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Receita por mês</h2>
        <div className="flex items-end gap-3" style={{ height: 160 }}>
          {months.length === 0 && <p className="text-sm text-gray-400">Sem dados ainda.</p>}
          {months.map(([label, value]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className="w-10 rounded-t bg-brand-500"
                style={{ height: `${(value / maxRevenue) * 120}px` }}
                title={formatCurrency(value)}
              />
              <span className="text-[10px] text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <h2 className="px-6 pt-4 text-sm font-semibold text-gray-700">Faturas vencidas</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Vencimento</th>
            </tr>
          </thead>
          <tbody>
            {overdue.map((invoice) => (
              <tr key={invoice.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {invoice.patients?.full_name}
                </td>
                <td className="px-4 py-3 text-gray-700">{formatCurrency(invoice.amount_cents)}</td>
                <td className="px-4 py-3 text-red-600">
                  {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('pt-BR') : '-'}
                </td>
              </tr>
            ))}
            {overdue.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma fatura vencida.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
