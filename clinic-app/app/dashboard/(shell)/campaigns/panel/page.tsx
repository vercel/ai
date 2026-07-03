import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Campaign } from '@/lib/types';

export default async function CampaignsPanelPage() {
  const supabase = createSupabaseServerClient();
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('status, channel')
    .returns<Pick<Campaign, 'status' | 'channel'>[]>();

  const rows = campaigns ?? [];
  const total = rows.length;
  const rascunho = rows.filter((c) => c.status === 'rascunho').length;
  const agendada = rows.filter((c) => c.status === 'agendada').length;
  const enviada = rows.filter((c) => c.status === 'enviada').length;

  const byChannel = rows.reduce<Record<string, number>>((acc, c) => {
    acc[c.channel] = (acc[c.channel] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Painel de campanhas</h1>
      <p className="mb-6 text-sm text-gray-500">Resumo das campanhas cadastradas</p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Total</p>
          <p className="text-2xl font-semibold text-gray-800">{total}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Rascunho</p>
          <p className="text-2xl font-semibold text-gray-800">{rascunho}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Agendadas</p>
          <p className="text-2xl font-semibold text-gray-800">{agendada}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Enviadas</p>
          <p className="text-2xl font-semibold text-gray-800">{enviada}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Por canal</h2>
        {Object.keys(byChannel).length === 0 && (
          <p className="text-sm text-gray-400">Nenhuma campanha cadastrada ainda.</p>
        )}
        <ul className="flex flex-col gap-2">
          {Object.entries(byChannel).map(([channel, count]) => (
            <li key={channel} className="flex justify-between text-sm text-gray-600">
              <span>{channel}</span>
              <span className="font-medium text-gray-800">{count}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Métricas de entrega, abertura e cliques dependem do provedor real de e-mail/SMS/WhatsApp,
        ainda não configurado. Por enquanto este painel mostra apenas contagens internas.
      </p>
    </div>
  );
}
