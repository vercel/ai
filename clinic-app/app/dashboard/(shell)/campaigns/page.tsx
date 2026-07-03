import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Campaign } from '@/lib/types';
import { SendCampaignButton } from '@/components/send-campaign-button';
import { DeleteCampaignButton } from '@/components/delete-campaign-button';

const STATUS_LABELS: Record<Campaign['status'], string> = {
  rascunho: 'Rascunho',
  agendada: 'Agendada',
  enviada: 'Enviada',
};

export default async function CampaignsPage() {
  const supabase = createSupabaseServerClient();
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .returns<Campaign[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Campanhas</h1>
        <Link
          href="/dashboard/campaigns/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Nova campanha
        </Link>
      </div>

      <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Módulo de registro/controle de campanhas. O envio real depende de credenciais de um
        provedor de e-mail/SMS, que ainda não foram configuradas — por isso, marcar como
        "enviada" aqui não dispara mensagens reais.
      </p>

      <div className="flex flex-col gap-4">
        {(campaigns ?? []).map((campaign) => (
          <div key={campaign.id} className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">{campaign.name}</h2>
                <p className="text-xs text-gray-400">
                  Canal: {campaign.channel}
                  {campaign.target_filter ? ` · Público: ${campaign.target_filter}` : ''}
                </p>
              </div>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {STATUS_LABELS[campaign.status]}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-gray-600">{campaign.message}</p>
            <div className="mt-3 flex justify-end gap-3 text-xs">
              {campaign.status !== 'enviada' && <SendCampaignButton id={campaign.id} />}
              <DeleteCampaignButton id={campaign.id} />
            </div>
          </div>
        ))}
        {(campaigns ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhuma campanha cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
