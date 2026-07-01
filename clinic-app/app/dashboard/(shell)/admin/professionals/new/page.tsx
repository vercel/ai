import Link from 'next/link';
import { DocumentInput } from '@/components/document-input';
import { CommissionPreview } from '@/components/commission-preview';
import { createProfessional } from './actions';

const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm';

export default function NewProfessionalPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="max-w-3xl">
      <div className="mb-2 text-xs text-gray-400">
        <Link href="/dashboard/admin" className="hover:underline">Administração</Link> / Novo profissional
      </div>
      <h1 className="mb-1 text-2xl font-semibold text-brand-700">Cadastrar profissional</h1>
      <p className="mb-6 text-sm text-gray-500">
        Cria uma conta com papel de profissional e define o percentual de repasse.
      </p>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form action={createProfessional} className="flex flex-col gap-6">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Dados pessoais e profissionais</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="full_name" required placeholder="Nome completo" className={`${inputClass} sm:col-span-2`} />
            <DocumentInput className={inputClass} />
            <input name="council_registration" placeholder="Conselho/Registro (ex: CRM 123456-SP)" className={inputClass} />
            <input name="specialty" placeholder="Especialidade" className={inputClass} />
            <input name="phone" placeholder="Telefone" className={inputClass} />
            <input name="email" type="email" required placeholder="E-mail" className={inputClass} />
            <input name="password" type="password" required minLength={6} placeholder="Senha provisória" className={inputClass} />
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Repasse financeiro</h2>
          <CommissionPreview className={inputClass} />
        </div>

        <button
          type="submit"
          className="self-start rounded bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Cadastrar profissional
        </button>
      </form>
    </div>
  );
}
