import { createPatient } from '../actions';

const inputClass = 'mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm';
const labelClass = 'text-sm text-gray-600';

export default function NewPatientPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Novo paciente</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form action={createPatient} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-gray-700">Dados pessoais</legend>
          <label className={labelClass}>
            Nome completo
            <input name="full_name" required className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              CPF
              <input name="cpf" className={inputClass} />
            </label>
            <label className={labelClass}>
              RG
              <input name="rg" className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Data de nascimento
              <input name="birth_date" type="date" className={inputClass} />
            </label>
            <label className={labelClass}>
              Gênero
              <select name="gender" defaultValue="" className={inputClass}>
                <option value="">-</option>
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
                <option value="outro">Outro</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Telefone
              <input name="phone" className={inputClass} />
            </label>
            <label className={labelClass}>
              E-mail
              <input name="email" type="email" className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Estado civil
              <input name="marital_status" className={inputClass} />
            </label>
            <label className={labelClass}>
              Profissão
              <input name="occupation" className={inputClass} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input name="is_active" type="checkbox" defaultChecked /> Paciente ativo
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-gray-700">Endereço</legend>
          <div className="grid grid-cols-3 gap-3">
            <label className={`${labelClass} col-span-2`}>
              Rua
              <input name="address_street" className={inputClass} />
            </label>
            <label className={labelClass}>
              Número
              <input name="address_number" className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Complemento
              <input name="address_complement" className={inputClass} />
            </label>
            <label className={labelClass}>
              Bairro
              <input name="address_neighborhood" className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              Cidade
              <input name="address_city" className={inputClass} />
            </label>
            <label className={labelClass}>
              Estado
              <input name="address_state" className={inputClass} />
            </label>
            <label className={labelClass}>
              CEP
              <input name="address_zip_code" className={inputClass} />
            </label>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-gray-700">Contato de emergência</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Nome
              <input name="emergency_contact_name" className={inputClass} />
            </label>
            <label className={labelClass}>
              Telefone
              <input name="emergency_contact_phone" className={inputClass} />
            </label>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-gray-700">Convênio</legend>
          <label className={labelClass}>
            Convênio
            <input name="insurance_provider" className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Número da carteirinha
              <input name="insurance_id_number" className={inputClass} />
            </label>
            <label className={labelClass}>
              Número de autorização
              <input name="insurance_authorization_number" className={inputClass} />
            </label>
          </div>
          <label className={labelClass}>
            Sessões autorizadas
            <input name="insurance_sessions_authorized" type="number" min="0" className={inputClass} />
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-gray-700">Responsável legal</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Nome
              <input name="responsavel_nome" className={inputClass} />
            </label>
            <label className={labelClass}>
              CPF
              <input name="responsavel_cpf" className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              Parentesco
              <input name="responsavel_parentesco" className={inputClass} />
            </label>
            <label className={labelClass}>
              Telefone
              <input name="responsavel_telefone" className={inputClass} />
            </label>
            <label className={labelClass}>
              E-mail
              <input name="responsavel_email" type="email" className={inputClass} />
            </label>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-gray-700">Clínico</legend>
          <label className={labelClass}>
            Resumo diagnóstico
            <textarea name="diagnosis_summary" rows={2} className={inputClass} />
          </label>
          <label className={labelClass}>
            Data do diagnóstico
            <input name="diagnosis_date" type="date" className={inputClass} />
          </label>
          <label className={labelClass}>
            Alergias
            <textarea name="allergies" rows={2} className={inputClass} />
          </label>
          <label className={labelClass}>
            Condições crônicas
            <textarea name="chronic_conditions" rows={2} className={inputClass} />
          </label>
          <label className={labelClass}>
            Observações
            <textarea name="notes" rows={2} className={inputClass} />
          </label>
        </fieldset>

        <button
          type="submit"
          className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Salvar
        </button>
      </form>
    </div>
  );
}
