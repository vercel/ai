import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Patient } from '@/lib/types';

export default async function PatientsPage() {
  const supabase = createSupabaseServerClient();
  const { data: patients } = await supabase
    .from('patients')
    .select('*')
    .order('full_name')
    .returns<Patient[]>();

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
                  <Link
                    href={`/dashboard/patients/${patient.id}`}
                    className="text-brand-600 hover:underline"
                  >
                    Ver prontuário
                  </Link>
                </td>
              </tr>
            ))}
            {(patients ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhum paciente cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
