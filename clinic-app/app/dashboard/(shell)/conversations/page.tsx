import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Conversation, ConversationStatus } from '@/lib/types';

const STATUS_LABELS: Record<Conversation['status'], string> = {
  aberta: 'Aberta',
  pendente: 'Pendente',
  resolvida: 'Resolvida',
};

const STATUS_COLORS: Record<Conversation['status'], string> = {
  aberta: 'bg-green-50 text-green-700',
  pendente: 'bg-amber-50 text-amber-700',
  resolvida: 'bg-gray-100 text-gray-600',
};

const TABS: { value: ConversationStatus | 'todas'; label: string }[] = [
  { value: 'aberta', label: 'Abertas' },
  { value: 'pendente', label: 'Pendentes' },
  { value: 'resolvida', label: 'Resolvidas' },
  { value: 'todas', label: 'Todas' },
];

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createSupabaseServerClient();
  const activeTab = (searchParams.status as ConversationStatus | undefined) ?? 'aberta';

  let query = supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false });

  if (activeTab !== ('todas' as ConversationStatus)) {
    query = query.eq('status', activeTab);
  }

  const { data: conversations } = await query.returns<Conversation[]>();

  const { data: allConversations } = await supabase
    .from('conversations')
    .select('status')
    .returns<{ status: ConversationStatus }[]>();

  const countFor = (value: ConversationStatus | 'todas') =>
    value === 'todas'
      ? (allConversations ?? []).length
      : (allConversations ?? []).filter((c) => c.status === value).length;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-gray-800">Conversas</h1>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            {STATUS_LABELS[activeTab as Conversation['status']] ?? 'Todas'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/conversations/assistant"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Assistente
          </Link>
          <Link
            href="/dashboard/conversations/new"
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Nova conversa
          </Link>
        </div>
      </div>
      <p className="text-sm text-gray-500">Caixa de Entrada · WhatsApp, Instagram e e-mail</p>

      <div className="mb-4 mt-4 flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/dashboard/conversations?status=${tab.value}`}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === tab.value
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs ${
                activeTab === tab.value ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {countFor(tab.value)}
            </span>
          </Link>
        ))}
      </div>

      <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Pendente de configuração: integração real com a API do WhatsApp (Meta Cloud API) e o
        assistente de IA "Fer" para atendimento automático 24h, agendamento e disparos em massa —
        dependem de credenciais de um provedor que ainda não foram cadastradas. Por enquanto, as
        mensagens são registradas manualmente pela equipe.
      </p>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Contato</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Última atividade</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(conversations ?? []).map((conversation) => (
              <tr key={conversation.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {conversation.contact_name}
                  {conversation.contact_phone && (
                    <span className="ml-2 text-xs text-gray-400">
                      {conversation.contact_phone}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{conversation.channel}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(conversation.last_message_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${STATUS_COLORS[conversation.status]}`}
                  >
                    {STATUS_LABELS[conversation.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/conversations/${conversation.id}`}
                    className="text-brand-600 hover:underline"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {(conversations ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma conversa nesta categoria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
