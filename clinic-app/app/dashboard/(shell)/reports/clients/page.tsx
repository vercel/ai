import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Patient } from '@/lib/types';
import { ReportsTabs } from '../reports-tabs';

export default async function ClientsReportPage() {
  const supabase = createSupabaseServerClient();
  const { data: patients } = await supabase
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<Patient[]>();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Relatórios</h1>
      <p className="mb-4 text-sm text-gray-500">Clientes — últimos 100 cadastrados</p>
      <ReportsTabs />

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Cadastrado em</th>
            </tr>
          </thead>
          <tbody>
            {(patients ?? []).map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{p.full_name}</td>
                <td className="px-4 py-3 text-gray-500">{p.phone ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500">{p.email ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(p.created_at).toLocaleDateString('pt-BR')}
                </td>
              </tr>
            ))}
            {(patients ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
