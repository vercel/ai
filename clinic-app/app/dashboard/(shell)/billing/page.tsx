import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Invoice, Patient, PaymentMethod } from '@/lib/types';
import { MarkPaidButton } from '@/components/mark-paid-button';
import { DeleteInvoiceButton } from '@/components/delete-invoice-button';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';

type InvoiceRow = Invoice & { patients: Pick<Patient, 'full_name'> };

const STATUS_LABELS: Record<Invoice['status'], string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isOverdue(invoice: Invoice) {
  return (
    invoice.status === 'pendente' && invoice.due_date && new Date(invoice.due_date) < new Date()
  );
}

export default async function BillingPage() {
  const supabase = createSupabaseServerClient();
  const [{ data: invoices }, { data: paymentMethods }] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, patients(full_name)')
      .order('created_at', { ascending: false })
      .returns<InvoiceRow[]>(),
    supabase.from('payment_methods').select('*').order('name').returns<PaymentMethod[]>(),
  ]);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Faturas, recebimentos e situação de pagamento dos pacientes."
        action={
          <div className="flex gap-2">
            <Link
              href="/dashboard/billing/reports"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Relatórios
            </Link>
            <Link
              href="/dashboard/billing/new"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              + Nova fatura
            </Link>
          </div>
        }
      />

      <Card className="overflow-hidden">
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
                <td className="px-4 py-3">
                  <span
                    className={
                      isOverdue(invoice)
                        ? 'rounded bg-red-100 px-2 py-0.5 text-xs text-red-700'
                        : 'text-gray-500'
                    }
                  >
                    {isOverdue(invoice) ? 'Vencida' : STATUS_LABELS[invoice.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    {invoice.status === 'pendente' && (
                      <MarkPaidButton id={invoice.id} paymentMethods={paymentMethods ?? []} />
                    )}
                    <Link
                      href={`/dashboard/billing/${invoice.id}/edit`}
                      className="text-gray-500 hover:underline"
                    >
                      Editar
                    </Link>
                    <DeleteInvoiceButton id={invoice.id} />
                  </div>
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
      </Card>
    </div>
  );
}
