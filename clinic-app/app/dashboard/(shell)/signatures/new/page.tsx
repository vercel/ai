import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Patient } from '@/lib/types';
import { createSignatureRequest } from '../actions';

export default async function NewSignaturePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const { data: patients } = await supabase
    .from('patients')
    .select('id, full_name')
    .order('full_name')
    .returns<Pick<Patient, 'id' | 'full_name'>[]>();

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Solicitar assinatura</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form
        action={createSignatureRequest}
        className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm"
      >
        <label className="text-sm text-gray-600">
          Documento
          <input
            name="title"
            required
            placeholder="Ex: Termo de consentimento, Anamnese, Contrato"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Paciente
          <select
            name="patient_id"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
            {(patients ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
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
    </div>
  );
}
