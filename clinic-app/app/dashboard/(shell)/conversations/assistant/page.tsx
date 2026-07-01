import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AssistantSettings } from '@/lib/types';
import { updateAssistantSettings } from '../actions';

export default async function AssistantPage() {
  const supabase = createSupabaseServerClient();

  const { data: settings } = await supabase
    .from('assistant_settings')
    .select('*')
    .limit(1)
    .single<AssistantSettings>();

  if (!settings) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Assistente</h1>
        <p className="mt-4 text-sm text-gray-500">Configuração do assistente ainda não disponível.</p>
      </div>
    );
  }

  const saveWithId = updateAssistantSettings.bind(null, settings.id);

  return (
    <div className="max-w-2xl">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Assistente</h1>
          <p className="text-sm text-gray-500">Configurações do agente de IA {settings.name}</p>
        </div>
        <Link href="/dashboard/conversations" className="text-sm text-brand-600 hover:underline">
          Voltar para Conversas
        </Link>
      </div>

      <p className="mb-4 mt-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Pendente de configuração: o agente de IA {settings.name} ainda não está conectado a um
        provedor de LLM nem à API do WhatsApp (Meta Cloud API). As opções abaixo definem o
        comportamento desejado, mas o atendimento automático 24h, agendamento e disparos em massa
        só passam a funcionar de fato após o cadastro dessas credenciais.
      </p>

      <form action={saveWithId} className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm">
        <label className="flex items-center justify-between text-sm text-gray-700">
          <span>
            Assistente ativo
            <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {settings.enabled ? 'Ligado' : 'Desligado'}
            </span>
          </span>
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="h-4 w-4" />
        </label>

        <label className="text-sm text-gray-600">
          Nome do assistente
          <input
            name="name"
            defaultValue={settings.name}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm text-gray-600">
          Persona / instruções
          <textarea
            name="persona"
            defaultValue={settings.persona}
            rows={4}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-gray-700">
          Agendamento automático de consultas
          <input
            type="checkbox"
            name="auto_schedule"
            defaultChecked={settings.auto_schedule}
            className="h-4 w-4"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-gray-700">
          Disparos em massa via WhatsApp
          <input
            type="checkbox"
            name="auto_broadcast"
            defaultChecked={settings.auto_broadcast}
            className="h-4 w-4"
          />
        </label>

        <button
          type="submit"
          className="mt-2 self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Salvar configurações
        </button>
      </form>
    </div>
  );
}
