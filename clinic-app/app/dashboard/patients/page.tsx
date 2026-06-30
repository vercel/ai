import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Patient } from '@/lib/types';
import { DeletePatientButton } from '@/components/delete-patient-button';

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const supabase = createSupabaseServerClient();
  const q = searchParams.q?.trim() ?? '';

  let query = supabase.from('patients').select('*').order('full_name');
  if (q) {
    query = query.or(`full_name.ilike.%${q}%,cpf.ilike.%${q}%`);
  }
  const { data: patients } = await query.returns<Patient[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Pacientes</h1>
        <Link
          href="/dashboard/patients/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Novo paciente
        </Link>
      </div>

      <form className="mb-4" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou CPF..."
          className="w-full max-w-sm rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </form>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(patients ?? []).map((patient) => (
              <tr key={patient.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{patient.full_name}</td>
                <td className="px-4 py-3 text-gray-500">{patient.phone ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500">{patient.email ?? '-'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/dashboard/patients/${patient.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      Ver prontuário
                    </Link>
                    <Link
                      href={`/dashboard/patients/${patient.id}/edit`}
                      className="text-gray-500 hover:underline"
                    >
                      Editar
                    </Link>
                    <DeletePatientButton id={patient.id} />
                  </div>
                </td>
              </tr>
            ))}
            {(patients ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhum paciente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
