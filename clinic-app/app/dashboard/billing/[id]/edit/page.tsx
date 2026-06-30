import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Invoice, Patient } from '@/lib/types';
import { updateInvoice } from '../../actions';

export default async function EditInvoicePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const [{ data: invoice }, { data: patients }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', params.id).single<Invoice>(),
    supabase.from('patients').select('id, full_name').order('full_name').returns<Patient[]>(),
  ]);

  if (!invoice) {
    notFound();
  }

  const updateWithId = updateInvoice.bind(null, params.id);

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
