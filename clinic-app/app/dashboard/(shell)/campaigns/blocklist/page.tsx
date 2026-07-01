import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CampaignBlocklistEntry } from '@/lib/types';
import { addToBlocklist } from '../actions';
import { RemoveBlocklistButton } from '@/components/remove-blocklist-button';

export default async function CampaignsBlocklistPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const { data: entries } = await supabase
    .from('campaign_blocklist')
    .select('*')
    .order('created_at', { ascending: false })
    .returns<CampaignBlocklistEntry[]>();

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Lista de bloqueio</h1>
      <p className="mb-6 text-sm text-gray-500">
        Contatos que não devem receber campanhas (opt-out)
      </p>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form
        action={addToBlocklist}
        className="mb-6 flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm"
      >
        <label className="text-sm text-gray-600">
          Contato (telefone ou e-mail)
          <input
            name="contact"
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Motivo
          <input
            name="reason"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Bloquear contato
        </button>
      </form>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Contato</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((entry) => (
              <tr key={entry.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{entry.contact}</td>
                <td className="px-4 py-3 text-gray-500">{entry.reason ?? '-'}</td>
                <td className="px-4 py-3 text-right">
                  <RemoveBlocklistButton id={entry.id} />
                </td>
              </tr>
            ))}
            {(entries ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Nenhum contato bloqueado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
