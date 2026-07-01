import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfileWithPlan } from '@/lib/auth';
import { saveFiscalSettings } from './actions';

export default async function FiscalSettingsPage() {
  const profile = await requireProfileWithPlan();
  if (profile.role !== 'admin') {
    return <p className="text-gray-500">Acesso restrito a administradores.</p>;
  }

  const supabase = createSupabaseServerClient();
  const { data: settings } = await supabase
    .from('clinic_fiscal_settings')
    .select('*')
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle<{
      municipal_registration: string | null;
      tax_regime: string | null;
      cnae: string | null;
      ctiss_code: string | null;
      iss_rate: number | null;
      cert_path: string | null;
      gateway_provider: string | null;
      gateway_company_id: string | null;
    }>();

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Configurações Fiscais / NFS-e</h1>

      <form action={saveFiscalSettings} className="space-y-6">
        {/* Dados tributários */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Dados tributários</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Inscrição Municipal</label>
              <input
                name="municipal_registration"
                defaultValue={settings?.municipal_registration ?? ''}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="00000000"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Regime tributário</label>
              <select
                name="tax_regime"
                defaultValue={settings?.tax_regime ?? ''}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione</option>
                <option value="simples_nacional">Simples Nacional</option>
                <option value="lucro_presumido">Lucro Presumido</option>
                <option value="lucro_real">Lucro Real</option>
                <option value="mei">MEI</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">CNAE</label>
              <input
                name="cnae"
                defaultValue={settings?.cnae ?? ''}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="8630-5/04"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Código CTISS</label>
              <input
                name="ctiss_code"
                defaultValue={settings?.ctiss_code ?? ''}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="0801-0/00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Alíquota ISS (%)</label>
              <input
                name="iss_rate"
                type="number"
                step="0.01"
                min="0"
                max="5"
                defaultValue={settings?.iss_rate ?? ''}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="2.00"
              />
            </div>
          </div>
        </div>

        {/* Certificado A1 */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Certificado Digital A1</h2>
          <p className="mb-4 text-xs text-gray-400">
            O arquivo .pfx deve ser enviado ao armazenamento externo (S3). Informe aqui o caminho e a senha do certificado — a senha é armazenada de forma criptografada.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Caminho do certificado (S3 path)</label>
              <input
                name="cert_path"
                defaultValue={settings?.cert_path ?? ''}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                placeholder="clinics/uuid/cert.pfx"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Senha do certificado</label>
              <input
                name="cert_password"
                type="password"
                autoComplete="new-password"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Deixe em branco para manter a atual"
              />
              <p className="mt-1 text-xs text-gray-400">Criptografada com pgcrypto antes de salvar.</p>
            </div>
          </div>
        </div>

        {/* Gateway NFS-e */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Gateway NFS-e</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Provedor</label>
              <select
                name="gateway_provider"
                defaultValue={settings?.gateway_provider ?? ''}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione</option>
                <option value="nfse_io">NFS-e.io</option>
                <option value="enotas">eNotas</option>
                <option value="focus_nfe">Focus NFe</option>
                <option value="nuvemfiscal">Nuvem Fiscal</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">ID da empresa no gateway</label>
              <input
                name="gateway_company_id"
                defaultValue={settings?.gateway_company_id ?? ''}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                placeholder="company_abc123"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Salvar configurações
          </button>
        </div>
      </form>
    </div>
  );
}
