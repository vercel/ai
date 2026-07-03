import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Invoice, Patient } from '@/lib/types';
import { createFiscalNote } from '../actions';

type InvoiceOption = Pick<Invoice, 'id' | 'amount_cents'> & {
  patients: Pick<Patient, 'full_name'>;
};

export default async function NewFiscalNotePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, amount_cents, patients(full_name)')
    .order('created_at', { ascending: false })
    .returns<InvoiceOption[]>();

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Nova nota fiscal</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form
        action={createFiscalNote}
        className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm"
      >
        <label className="text-sm text-gray-600">
          Fatura
          <select
            name="invoice_id"
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
            {(invoices ?? []).map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.patients?.full_name} ·{' '}
                {(invoice.amount_cents / 100).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Número
          <input
            name="number"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Série
          <input
            name="series"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Salvar
        </button>
      </form>
    </div>
  );
}
