import { createPatient } from '../actions';

export default function NewPatientPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Novo paciente</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form action={createPatient} className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
        <label className="text-sm text-gray-600">
          Nome completo
          <input
            name="full_name"
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          CPF
          <input name="cpf" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-gray-600">
          Data de nascimento
          <input
            name="birth_date"
            type="date"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Telefone
          <input name="phone" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-gray-600">
          E-mail
          <input
            name="email"
            type="email"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Endereço
          <input name="address" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
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
