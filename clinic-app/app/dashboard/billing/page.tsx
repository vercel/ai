import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Invoice, Patient } from '@/lib/types';
import { MarkPaidButton } from '@/components/mark-paid-button';

type InvoiceRow = Invoice & { patients: Pick<Patient, 'full_name'> };

const STATUS_LABELS: Record<Invoice['status'], string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function BillingPage() {
  const supabase = createSupabaseServerClient();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, patients(full_name)')
    .order('created_at', { ascending: false })
    .returns<InvoiceRow[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Financeiro</h1>
        <Link
          href="/dashboard/billing/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Nova fatura
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).map((invoice) => (
              <tr key={invoice.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {invoice.patients?.full_name}
                </td>
                <td className="px-4 py-3 text-gray-700">{formatCurrency(invoice.amount_cents)}</td>
                <td className="px-4 py-3 text-gray-500">
                  {invoice.due_date
                    ? new Date(invoice.due_date).toLocaleDateString('pt-BR')
                    : '-'}
                </td>
                <td className="px-4 py-3 text-gray-500">{STATUS_LABELS[invoice.status]}</td>
                <td className="px-4 py-3 text-right">
                  {invoice.status === 'pendente' && <MarkPaidButton id={invoice.id} />}
                </td>
              </tr>
            ))}
            {(invoices ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma fatura cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
