import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Invoice, InvoiceItem, Patient, PaymentMethod } from '@/lib/types';
import { addInvoiceItem, deleteInvoiceItem, updateInvoice } from '../../actions';
import { DeleteInvoiceItemButton } from '@/components/delete-invoice-item-button';

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function EditInvoicePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const [{ data: invoice }, { data: patients }, { data: paymentMethods }, { data: items }] =
    await Promise.all([
      supabase.from('invoices').select('*').eq('id', params.id).single<Invoice>(),
      supabase.from('patients').select('id, full_name').order('full_name').returns<Patient[]>(),
      supabase.from('payment_methods').select('*').order('name').returns<PaymentMethod[]>(),
      supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', params.id)
        .order('created_at')
        .returns<InvoiceItem[]>(),
    ]);

  if (!invoice) {
    notFound();
  }

  const updateWithId = updateInvoice.bind(null, params.id);
  const addItemAction = addInvoiceItem.bind(null, params.id);

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Editar fatura</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form action={updateWithId} className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
        <label className="text-sm text-gray-600">
          Paciente
          <select
            name="patient_id"
            required
            defaultValue={invoice.patient_id}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {(patients ?? []).map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Valor (R$)
          <input
            name="amount"
            type="number"
            step="0.01"
            required
            defaultValue={(invoice.amount_cents / 100).toFixed(2)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Vencimento
          <input
            name="due_date"
            type="date"
            defaultValue={invoice.due_date ?? ''}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Status
          <select
            name="status"
            defaultValue={invoice.status}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Forma de pagamento
          <select
            name="payment_method_id"
            defaultValue={invoice.payment_method_id ?? ''}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">-</option>
            {(paymentMethods ?? []).map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="mt-2 rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Salvar
        </button>
      </form>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">Itens da fatura</h2>
      <div className="mb-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Descrição</th>
              <th className="px-4 py-2">Qtd</th>
              <th className="px-4 py-2">Unit.</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <tr key={item.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-700">{item.description}</td>
                <td className="px-4 py-2 text-gray-500">{item.quantity}</td>
                <td className="px-4 py-2 text-gray-500">{formatCurrency(item.unit_price)}</td>
                <td className="px-4 py-2 text-gray-700">{formatCurrency(item.total_price)}</td>
                <td className="px-4 py-2 text-right">
                  <DeleteInvoiceItemButton invoiceId={params.id} id={item.id} />
                </td>
              </tr>
            ))}
            {(items ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400">
                  Nenhum item adicionado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <form
        action={addItemAction}
        className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-4 shadow-sm"
      >
        <label className="flex-1 text-xs text-gray-500">
          Descrição
          <input
            name="description"
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="w-20 text-xs text-gray-500">
          Qtd
          <input
            name="quantity"
            type="number"
            min="1"
            step="1"
            defaultValue={1}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="w-28 text-xs text-gray-500">
          Valor unit. (R$)
          <input
            name="unit_price"
            type="number"
            min="0"
            step="0.01"
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          Adicionar item
        </button>
      </form>
    </div>
  );
}
