import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Patient } from '@/lib/types';
import { DeletePatientButton } from '@/components/delete-patient-button';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';

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
      <PageHeader
        title="Pacientes"
        description={`${(patients ?? []).length} paciente(s) cadastrado(s).`}
        action={
          <div className="flex gap-2">
            <Link
              href="/dashboard/patients/import"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Importar CSV
            </Link>
            <Link
              href="/dashboard/patients/new"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              + Novo paciente
            </Link>
          </div>
        }
      />

      <form className="mb-4" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou CPF..."
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </form>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Convênio</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(patients ?? []).map((patient) => (
              <tr key={patient.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{patient.full_name}</td>
                <td className="px-4 py-3 text-gray-500">{patient.phone ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500">{patient.email ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500">{patient.insurance_provider ?? '-'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      patient.is_active
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {patient.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
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
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Nenhum paciente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
