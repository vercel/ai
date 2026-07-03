import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfileWithPlan } from '@/lib/auth';
import type { ClinicSettings, MessageTemplate, PaymentMethod, Profile, Room } from '@/lib/types';
import { MODULE_LABELS } from '@/lib/plans';
import { RoleSelect } from '@/components/role-select';
import { AssetUploadField } from '@/components/asset-upload-field';
import { ModalForm } from '@/components/modal-form';
import { PageHeader, SettingsSection } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createCollaborator,
  createMessageTemplate,
  createPaymentMethod,
  createRoom,
  deleteMessageTemplate,
  deletePaymentMethod,
  deleteRoom,
  toggleMessageTemplateActive,
  toggleRoomActive,
  updateClinicSettings,
} from './actions';

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';
const labelClass = 'text-xs font-medium text-gray-500';
const submitClass =
  'self-start rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { error?: string; success?: string };
}) {
  const profile = await requireProfileWithPlan();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  const [
    { data: profiles },
    { data: rooms },
    { data: templates },
    { data: paymentMethods },
    { data: clinicSettings },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .order('full_name')
      .returns<Profile[]>(),
    supabase.from('rooms').select('*').order('name').returns<Room[]>(),
    supabase.from('message_templates').select('*').order('name').returns<MessageTemplate[]>(),
    supabase.from('payment_methods').select('*').order('name').returns<PaymentMethod[]>(),
    supabase
      .from('clinic_settings')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .maybeSingle<ClinicSettings>(),
  ]);

  const userCount = profiles?.length ?? 0;
  const maxUsers = profile.plan?.max_users ?? null;
  const seatLimitReached = maxUsers !== null && userCount >= maxUsers;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Administração"
        description="Gerencie equipe, salas, formas de pagamento e as configurações da clínica."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/admin/templates"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Modelos de prontuário
            </Link>
            <Link
              href="/dashboard/admin/professionals/new"
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Cadastrar profissional
            </Link>
          </div>
        }
      />

      {searchParams.error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{searchParams.error}</p>
      )}
      {searchParams.success && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{searchParams.success}</p>
      )}

      {profile.plan && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-400">Plano atual</p>
              <p className="text-lg font-semibold text-brand-600">{profile.plan.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Usuários</p>
              <p className="text-lg font-semibold text-gray-800">
                {userCount}
                <span className="text-sm font-normal text-gray-400">/{maxUsers ?? '∞'}</span>
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-400">Módulos</p>
              <p className="truncate text-sm text-gray-600">
                {profile.plan.modules.map((module) => MODULE_LABELS[module] ?? module).join(' · ')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Equipe */}
      <Card>
        <CardHeader
          action={
            seatLimitReached ? undefined : (
              <ModalForm triggerLabel="+ Cadastrar colaborador" title="Cadastrar colaborador">
                <form action={createCollaborator} className="flex flex-col gap-3">
                  <input name="full_name" required placeholder="Nome completo" className={inputClass} />
                  <input name="email" type="email" required placeholder="E-mail" className={inputClass} />
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    placeholder="Senha"
                    className={inputClass}
                  />
                  <select name="role" defaultValue="recepcao" className={inputClass}>
                    <option value="recepcao">Recepção</option>
                    <option value="medico">Médico</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <button type="submit" className={submitClass}>
                    Cadastrar colaborador
                  </button>
                </form>
              </ModalForm>
            )
          }
        >
          <CardTitle>Equipe</CardTitle>
          <CardDescription>
            {seatLimitReached
              ? 'Limite de usuários do plano atingido. Faça upgrade para adicionar mais.'
              : `${userCount} colaborador(es) cadastrado(s).`}
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">Nome</th>
                <th className="px-6 py-3 font-medium">Cadastrado em</th>
                <th className="px-6 py-3 font-medium">Função</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((user) => (
                <tr key={user.id} className="border-t border-gray-100">
                  <td className="px-6 py-3 font-medium text-gray-800">{user.full_name}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {new Date(user.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-3">
                    <RoleSelect userId={user.id} role={user.role} />
                  </td>
                </tr>
              ))}
              {(profiles ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-6 text-center text-gray-400">
                    Nenhum colaborador ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Salas & Modelos de mensagem */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            action={
              <ModalForm triggerLabel="+ Nova sala" title="Nova sala">
                <form action={createRoom} className="flex flex-col gap-3">
                  <input name="name" required placeholder="Nome da sala" className={inputClass} />
                  <input name="description" placeholder="Descrição (opcional)" className={inputClass} />
                  <input name="capacity" type="number" min="1" defaultValue={1} className={inputClass} />
                  <button type="submit" className={submitClass}>
                    Adicionar sala
                  </button>
                </form>
              </ModalForm>
            }
          >
            <CardTitle>Salas</CardTitle>
            <CardDescription>Ambientes disponíveis para agendamento.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(rooms ?? []).map((room) => (
              <div
                key={room.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{room.name}</p>
                  <p className="text-xs text-gray-400">
                    Capacidade: {room.capacity}
                    {!room.is_active && ' · Inativa'}
                  </p>
                </div>
                <div className="flex gap-3">
                  <form action={toggleRoomActive.bind(null, room.id, !room.is_active)}>
                    <button type="submit" className="text-xs text-brand-600 hover:underline">
                      {room.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </form>
                  <form action={deleteRoom.bind(null, room.id)}>
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      Excluir
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {(rooms ?? []).length === 0 && (
              <p className="text-sm text-gray-400">Nenhuma sala cadastrada ainda.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            action={
              <ModalForm triggerLabel="+ Novo modelo" title="Novo modelo de mensagem">
                <form action={createMessageTemplate} className="flex flex-col gap-3">
                  <input name="name" required placeholder="Nome do modelo" className={inputClass} />
                  <select name="message_type" defaultValue="WhatsApp" className={inputClass}>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="E-mail">E-mail</option>
                    <option value="SMS">SMS</option>
                  </select>
                  <input name="subject" placeholder="Assunto (e-mail, opcional)" className={inputClass} />
                  <input
                    name="purpose"
                    placeholder="Finalidade (ex: confirmação de consulta)"
                    className={inputClass}
                  />
                  <textarea
                    name="content"
                    required
                    rows={3}
                    placeholder="Conteúdo da mensagem..."
                    className={inputClass}
                  />
                  <button type="submit" className={submitClass}>
                    Adicionar modelo
                  </button>
                </form>
              </ModalForm>
            }
          >
            <CardTitle>Modelos de mensagem</CardTitle>
            <CardDescription>Textos padrão para campanhas e lembretes.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(templates ?? []).map((template) => (
              <div key={template.id} className="rounded-lg border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {template.name}
                      {!template.is_active && (
                        <span className="ml-2 text-xs font-normal text-gray-400">(inativo)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {template.message_type}
                      {template.purpose && ` · ${template.purpose}`}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">{template.content}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <form
                      action={toggleMessageTemplateActive.bind(null, template.id, !template.is_active)}
                    >
                      <button type="submit" className="text-xs text-brand-600 hover:underline">
                        {template.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                    </form>
                    <form action={deleteMessageTemplate.bind(null, template.id)}>
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Excluir
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
            {(templates ?? []).length === 0 && (
              <p className="text-sm text-gray-400">Nenhum modelo cadastrado ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Formas de pagamento */}
      <Card>
        <CardHeader
          action={
            <ModalForm triggerLabel="+ Nova forma" title="Nova forma de pagamento">
              <form action={createPaymentMethod} className="flex flex-col gap-3">
                <input
                  name="name"
                  required
                  placeholder="Nome (ex: Cartão de crédito, Pix)"
                  className={inputClass}
                />
                <select name="payment_type" defaultValue="" className={inputClass}>
                  <option value="">Tipo (opcional)</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_credito">Cartão de crédito</option>
                  <option value="cartao_debito">Cartão de débito</option>
                  <option value="pix">Pix</option>
                  <option value="boleto">Boleto</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input name="is_default" type="checkbox" />
                  Padrão
                </label>
                <button type="submit" className={submitClass}>
                  Adicionar forma de pagamento
                </button>
              </form>
            </ModalForm>
          }
        >
          <CardTitle>Formas de pagamento</CardTitle>
          <CardDescription>Meios aceitos no faturamento da clínica.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(paymentMethods ?? []).map((method) => (
            <div
              key={method.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {method.name}
                  {method.is_default && (
                    <span className="ml-2 text-xs font-normal text-brand-600">(padrão)</span>
                  )}
                </p>
                {method.payment_type && <p className="text-xs text-gray-400">{method.payment_type}</p>}
              </div>
              <form action={deletePaymentMethod.bind(null, method.id)}>
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Excluir
                </button>
              </form>
            </div>
          ))}
          {(paymentMethods ?? []).length === 0 && (
            <p className="text-sm text-gray-400">Nenhuma forma de pagamento cadastrada ainda.</p>
          )}
        </CardContent>
      </Card>

      {/* Dados da clínica */}
      <SettingsSection
        title="Dados da clínica"
        description="Informações de identidade, timbre para documentos e integração de mensageria."
      >
        <Card>
          <CardContent>
            <form action={updateClinicSettings} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Nome da clínica
                  <input
                    name="clinic_name"
                    required
                    defaultValue={clinicSettings?.clinic_name ?? ''}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className={labelClass}>
                  CNPJ
                  <input name="cnpj" defaultValue={clinicSettings?.cnpj ?? ''} className={`mt-1 ${inputClass}`} />
                </label>
                <label className={labelClass}>
                  Endereço
                  <input
                    name="address"
                    defaultValue={clinicSettings?.address ?? ''}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className={labelClass}>
                  Telefone
                  <input
                    name="phone"
                    defaultValue={clinicSettings?.phone ?? ''}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className={labelClass}>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    defaultValue={clinicSettings?.email ?? ''}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className={labelClass}>
                  Cor primária
                  <input
                    name="primary_color"
                    type="color"
                    defaultValue={clinicSettings?.primary_color ?? '#2563eb'}
                    className="mt-1 h-9 w-full rounded-lg border border-gray-300 px-1 py-1 text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AssetUploadField
                  clinicId={profile.clinic_id!}
                  name="logo_url"
                  label="Logo"
                  currentUrl={clinicSettings?.logo_url ?? null}
                />
                <AssetUploadField
                  clinicId={profile.clinic_id!}
                  name="letterhead_url"
                  label="Timbre (fundo do cabeçalho dos documentos)"
                  currentUrl={clinicSettings?.letterhead_url ?? null}
                />
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Integração WhatsApp
                </h3>
                <p className="mb-3 mt-1 text-xs text-gray-500">
                  Usado para enviar lembretes automáticos de consulta (Evolution API, Z-API ou
                  compatível).
                </p>
                <div className="flex flex-col gap-4">
                  <label className={labelClass}>
                    URL da instância
                    <input
                      name="whatsapp_instance_url"
                      placeholder="https://sua-instancia.exemplo.com/message/send"
                      defaultValue={clinicSettings?.whatsapp_instance_url ?? ''}
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                  <label className={labelClass}>
                    Token da API
                    <input
                      name="whatsapp_api_token"
                      type="password"
                      placeholder="Token/apikey da instância"
                      defaultValue={clinicSettings?.whatsapp_api_token ?? ''}
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                </div>
              </div>

              <button type="submit" className={submitClass}>
                Salvar dados da clínica
              </button>
            </form>
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  );
}
