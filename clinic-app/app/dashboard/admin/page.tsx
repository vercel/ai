import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfileWithPlan } from '@/lib/auth';
import type { ClinicSettings, MessageTemplate, PaymentMethod, Profile, Room } from '@/lib/types';
import { MODULE_LABELS } from '@/lib/plans';
import { RoleSelect } from '@/components/role-select';
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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { error?: string };
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
    supabase.from('clinic_settings').select('*').limit(1).maybeSingle<ClinicSettings>(),
  ]);

  const userCount = profiles?.length ?? 0;
  const maxUsers = profile.plan?.max_users ?? null;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Administração</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      {profile.plan && (
        <div className="mb-6 rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700">
            Plano: <span className="text-brand-600">{profile.plan.name}</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Usuários: {userCount}/{maxUsers ?? '∞'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Módulos: {profile.plan.modules.map((module) => MODULE_LABELS[module] ?? module).join(', ')}
          </p>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Cadastrar colaborador</h2>
      <div className="mb-6 max-w-md rounded-xl bg-white p-4 shadow-sm">
        {maxUsers !== null && userCount >= maxUsers ? (
          <p className="text-sm text-gray-500">
            Limite de usuários do plano atingido. Faça upgrade para adicionar mais colaboradores.
          </p>
        ) : (
          <form action={createCollaborator} className="flex flex-col gap-2">
            <input
              name="full_name"
              required
              placeholder="Nome completo"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="E-mail"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="password"
              type="password"
              required
              minLength={6}
              placeholder="Senha"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              name="role"
              defaultValue="recepcao"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="recepcao">Recepção</option>
              <option value="medico">Médico</option>
              <option value="admin">Administrador</option>
            </select>
            <button
              type="submit"
              className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Cadastrar colaborador
            </button>
          </form>
        )}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Usuários</h2>
      <div className="mb-10 overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Cadastrado em</th>
              <th className="px-4 py-3">Função</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((user) => (
              <tr key={user.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{user.full_name}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(user.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <RoleSelect userId={user.id} role={user.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Salas</h2>
          <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
            <form action={createRoom} className="flex flex-col gap-2">
              <input
                name="name"
                required
                placeholder="Nome da sala"
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="description"
                placeholder="Descrição (opcional)"
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="capacity"
                type="number"
                min="1"
                defaultValue={1}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Adicionar sala
              </button>
            </form>
          </div>
          <div className="flex flex-col gap-2">
            {(rooms ?? []).map((room) => (
              <div
                key={room.id}
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
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
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Modelos de mensagem</h2>
          <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
            <form action={createMessageTemplate} className="flex flex-col gap-2">
              <input
                name="name"
                required
                placeholder="Nome do modelo"
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <select
                name="message_type"
                defaultValue="WhatsApp"
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="WhatsApp">WhatsApp</option>
                <option value="E-mail">E-mail</option>
                <option value="SMS">SMS</option>
              </select>
              <input
                name="subject"
                placeholder="Assunto (e-mail, opcional)"
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="purpose"
                placeholder="Finalidade (ex: confirmação de consulta)"
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <textarea
                name="content"
                required
                rows={3}
                placeholder="Conteúdo da mensagem..."
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Adicionar modelo
              </button>
            </form>
          </div>
          <div className="flex flex-col gap-2">
            {(templates ?? []).map((template) => (
              <div key={template.id} className="rounded-xl bg-white p-4 shadow-sm">
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
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Formas de pagamento</h2>
      <div className="mb-4 max-w-md rounded-xl bg-white p-4 shadow-sm">
        <form action={createPaymentMethod} className="flex flex-col gap-2">
          <input
            name="name"
            required
            placeholder="Nome (ex: Cartão de crédito, Pix)"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="payment_type"
            defaultValue=""
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
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
          <button
            type="submit"
            className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Adicionar forma de pagamento
          </button>
        </form>
      </div>
      <div className="flex max-w-md flex-col gap-2">
        {(paymentMethods ?? []).map((method) => (
          <div
            key={method.id}
            className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">
                {method.name}
                {method.is_default && (
                  <span className="ml-2 text-xs font-normal text-brand-600">(padrão)</span>
                )}
              </p>
              {method.payment_type && (
                <p className="text-xs text-gray-400">{method.payment_type}</p>
              )}
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
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">Dados da clínica</h2>
      <div className="max-w-md rounded-xl bg-white p-4 shadow-sm">
        <form action={updateClinicSettings} className="flex flex-col gap-2">
          <label className="text-xs text-gray-500">
            Nome da clínica
            <input
              name="clinic_name"
              required
              defaultValue={clinicSettings?.clinic_name ?? ''}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            CNPJ
            <input
              name="cnpj"
              defaultValue={clinicSettings?.cnpj ?? ''}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            Endereço
            <input
              name="address"
              defaultValue={clinicSettings?.address ?? ''}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            Telefone
            <input
              name="phone"
              defaultValue={clinicSettings?.phone ?? ''}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            E-mail
            <input
              name="email"
              type="email"
              defaultValue={clinicSettings?.email ?? ''}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            URL do logo
            <input
              name="logo_url"
              defaultValue={clinicSettings?.logo_url ?? ''}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            Cor primária
            <input
              name="primary_color"
              type="color"
              defaultValue={clinicSettings?.primary_color ?? '#2563eb'}
              className="mt-1 h-9 w-full rounded border border-gray-300 px-1 py-1 text-sm"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Salvar dados da clínica
          </button>
        </form>
      </div>
    </div>
  );
}
