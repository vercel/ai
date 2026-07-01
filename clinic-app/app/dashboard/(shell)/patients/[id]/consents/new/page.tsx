import { createConsentForm } from '../actions';

export default function NewConsentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const createWithPatient = createConsentForm.bind(null, params.id);

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Novo termo de consentimento</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form
        action={createWithPatient}
        className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm"
      >
        <label className="text-sm text-gray-600">
          Título
          <input
            name="title"
            required
            placeholder="Ex: Consentimento para procedimento estético"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Texto do termo
          <textarea
            name="content"
            required
            rows={8}
            placeholder="Descreva o procedimento, riscos, uso de imagem, LGPD, etc."
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
