import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Patient, PatientCRM } from '@/lib/types';
import { PatientCrmStageSelect } from '@/components/patient-crm-stage-select';
import { DeletePatientCrmButton } from '@/components/delete-patient-crm-button';
import { ConvertCrmContactButton } from '@/components/convert-crm-contact-button';
import { addPatientToCrm } from './actions';

type CrmRow = PatientCRM & { patients: Pick<Patient, 'full_name' | 'phone' | 'email'> | null };

export default async function CrmPage() {
  const supabase = createSupabaseServerClient();
  const [{ data: crmRows }, { data: patients }] = await Promise.all([
    supabase
      .from('patient_crm')
      .select('*, patients(full_name, phone, email)')
      .order('created_at', { ascending: false })
      .returns<CrmRow[]>(),
    supabase.from('patients').select('id, full_name').order('full_name').returns<Patient[]>(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">CRM · Funil de relacionamento</h1>
        <Link
          href="/dashboard/crm/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Novo contato
        </Link>
      </div>

      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <form action={addPatientToCrm} className="flex items-end gap-2">
          <label className="flex-1 text-xs text-gray-500">
            Adicionar paciente existente ao funil
            <select
              name="patient_id"
              required
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Selecione...</option>
              {(patients ?? []).map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs text-gray-500">
            Próxima ação
            <input
              name="next_action"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            Adicionar ao funil
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Contato</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Estágio</th>
              <th className="px-4 py-3">Próxima ação</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(crmRows ?? []).map((row) => {
              const isPatient = Boolean(row.patient_id);
              const name = row.patients?.full_name ?? row.full_name ?? '-';
              const contact = row.patients?.phone ?? row.patients?.email ?? row.phone ?? row.email ?? '-';
              return (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {name}
                    {isPatient && (
                      <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-normal text-brand-600">
                        Paciente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{contact}</td>
                  <td className="px-4 py-3 text-gray-500">{row.source ?? '-'}</td>
                  <td className="px-4 py-3">
                    <PatientCrmStageSelect id={row.id} stage={row.current_stage} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{row.next_action ?? '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      {!isPatient && <ConvertCrmContactButton id={row.id} />}
                      <DeletePatientCrmButton id={row.id} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {(crmRows ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Nenhum contato no funil ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
