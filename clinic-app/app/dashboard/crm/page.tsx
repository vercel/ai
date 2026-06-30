import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Lead, Patient, PatientCRM } from '@/lib/types';
import { LeadStageSelect } from '@/components/lead-stage-select';
import { DeleteLeadButton } from '@/components/delete-lead-button';
import { PatientCrmStageSelect } from '@/components/patient-crm-stage-select';
import { DeletePatientCrmButton } from '@/components/delete-patient-crm-button';
import { addPatientToCrm } from './actions';

type PatientCrmRow = PatientCRM & { patients: Pick<Patient, 'full_name'> };

export default async function CrmPage() {
  const supabase = createSupabaseServerClient();
  const [{ data: leads }, { data: patientCrmRows }, { data: patients }] = await Promise.all([
    supabase.from('leads').select('*').order('created_at', { ascending: false }).returns<Lead[]>(),
    supabase
      .from('patient_crm')
      .select('*, patients(full_name)')
      .order('created_at', { ascending: false })
      .returns<PatientCrmRow[]>(),
    supabase.from('patients').select('id, full_name').order('full_name').returns<Patient[]>(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">CRM</h1>
        <Link
          href="/dashboard/crm/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Novo lead
        </Link>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Funil de pacientes</h2>
      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <form action={addPatientToCrm} className="flex items-end gap-2">
          <label className="flex-1 text-xs text-gray-500">
            Paciente
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

      <div className="mb-10 overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Estágio</th>
              <th className="px-4 py-3">Próxima ação</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(patientCrmRows ?? []).map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{row.patients?.full_name}</td>
                <td className="px-4 py-3">
                  <PatientCrmStageSelect id={row.id} stage={row.current_stage} />
                </td>
                <td className="px-4 py-3 text-gray-500">{row.next_action ?? '-'}</td>
                <td className="px-4 py-3 text-right">
                  <DeletePatientCrmButton id={row.id} />
                </td>
              </tr>
            ))}
            {(patientCrmRows ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhum paciente no funil ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Leads</h2>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Contato</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Estágio</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(leads ?? []).map((lead) => (
              <tr key={lead.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{lead.full_name}</td>
                <td className="px-4 py-3 text-gray-500">
                  {lead.phone ?? lead.email ?? '-'}
                </td>
                <td className="px-4 py-3 text-gray-500">{lead.source ?? '-'}</td>
                <td className="px-4 py-3">
                  <LeadStageSelect id={lead.id} stage={lead.stage} />
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteLeadButton id={lead.id} />
                </td>
              </tr>
            ))}
            {(leads ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Nenhum lead cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
