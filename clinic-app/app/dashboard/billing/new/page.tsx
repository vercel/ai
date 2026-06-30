import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Patient, PaymentMethod } from '@/lib/types';
import { createInvoice } from '../actions';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const [{ data: patients }, { data: paymentMethods }] = await Promise.all([
    supabase.from('patients').select('id, full_name').order('full_name').returns<Patient[]>(),
    supabase.from('payment_methods').select('*').order('name').returns<PaymentMethod[]>(),
  ]);

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Nova fatura</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form action={createInvoice} className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
        <label className="text-sm text-gray-600">
          Paciente
          <select
            name="patient_id"
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
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
            min="0"
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Vencimento
          <input
            name="due_date"
            type="date"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Forma de pagamento
          <select
            name="payment_method_id"
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
          Criar fatura
        </button>
      </form>
    </div>
  );
}
