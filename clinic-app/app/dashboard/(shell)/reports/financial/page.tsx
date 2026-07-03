import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Invoice, Patient } from '@/lib/types';
import { ReportsTabs } from '../reports-tabs';

type InvoiceRow = Invoice & { patients: Pick<Patient, 'full_name'> };

const STATUS_LABELS: Record<Invoice['status'], string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function FinancialReportPage() {
  const supabase = createSupabaseServerClient();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, patients(full_name)')
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<InvoiceRow[]>();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Relatórios</h1>
      <p className="mb-4 text-sm text-gray-500">Financeiro — últimas 100 faturas</p>
      <ReportsTabs />

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).map((i) => (
              <tr key={i.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{i.patients?.full_name}</td>
                <td className="px-4 py-3 text-gray-700">{formatCurrency(i.amount_cents)}</td>
                <td className="px-4 py-3 text-gray-500">
                  {i.due_date ? new Date(i.due_date).toLocaleDateString('pt-BR') : '-'}
                </td>
                <td className="px-4 py-3 text-gray-500">{STATUS_LABELS[i.status]}</td>
              </tr>
            ))}
            {(invoices ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma fatura encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
