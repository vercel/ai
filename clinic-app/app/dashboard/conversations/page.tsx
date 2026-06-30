import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Conversation } from '@/lib/types';

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

export default async function ConversationsPage() {
  const supabase = createSupabaseServerClient();
  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false })
    .returns<Conversation[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Santé Conversas</h1>
          <p className="text-sm text-gray-500">Atendimento via WhatsApp</p>
        </div>
        <Link
          href="/dashboard/conversations/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Nova conversa
        </Link>
      </div>

      <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Pendente: integração real com a API do WhatsApp e assistente de IA para atendimento
        automático — depende de credenciais de um provedor (ex: Meta Cloud API) que ainda não
        foram configuradas. Por enquanto, as mensagens são registradas manualmente pela equipe.
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
                  Nenhuma conversa registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
