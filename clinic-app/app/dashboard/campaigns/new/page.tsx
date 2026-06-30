import { createCampaign } from '../actions';

export default function NewCampaignPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Nova campanha</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form action={createCampaign} className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
        <label className="text-sm text-gray-600">
          Nome
          <input
            name="name"
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Canal
          <select
            name="channel"
            defaultValue="email"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="email">E-mail</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Público-alvo (filtro/descrição)
          <input
            name="target_filter"
            placeholder="Ex: pacientes sem consulta há 60 dias"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Mensagem
          <textarea
            name="message"
            required
            rows={5}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Agendar envio para
          <input
            name="scheduled_at"
            type="datetime-local"
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
