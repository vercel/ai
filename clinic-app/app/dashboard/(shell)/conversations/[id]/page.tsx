import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Conversation, ConversationMessage } from '@/lib/types';
import { ConversationStatusSelect } from '@/components/conversation-status-select';
import { sendMessage } from '../actions';

const SENDER_LABELS: Record<ConversationMessage['sender'], string> = {
  contato: 'Contato',
  equipe: 'Equipe',
  ia: 'Fer (IA)',
};

export default async function ConversationDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', params.id)
    .single<Conversation>();

  if (!conversation) {
    notFound();
  }

  const { data: messages } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at')
    .returns<ConversationMessage[]>();

  const sendWithId = sendMessage.bind(null, conversation.id);

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">{conversation.contact_name}</h1>
          <p className="text-sm text-gray-500">
            {conversation.channel} {conversation.contact_phone ? `· ${conversation.contact_phone}` : ''}
          </p>
        </div>
        <ConversationStatusSelect id={conversation.id} status={conversation.status} />
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
        {(messages ?? []).map((message) => (
          <div
            key={message.id}
            className={`max-w-[80%] rounded-lg p-3 text-sm ${
              message.sender === 'contato'
                ? 'self-start bg-gray-100 text-gray-700'
                : 'self-end bg-brand-50 text-brand-700'
            }`}
          >
            <p className="mb-1 text-[10px] uppercase tracking-wide opacity-60">
              {SENDER_LABELS[message.sender]}
            </p>
            <p className="whitespace-pre-wrap">{message.body}</p>
          </div>
        ))}
        {(messages ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhuma mensagem ainda.</p>
        )}
      </div>

      <form action={sendWithId} className="flex gap-2">
        <input
          name="body"
          placeholder="Escrever mensagem..."
          required
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Enviar
        </button>
      </form>
      <p className="mt-2 text-xs text-gray-400">
        Envio manual (registro interno). O envio real via WhatsApp e respostas automáticas com IA
        dependem de credenciais de um provedor ainda não configurado.
      </p>
    </div>
  );
}
