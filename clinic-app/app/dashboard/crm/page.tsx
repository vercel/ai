import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Lead } from '@/lib/types';
import { LeadStageSelect } from '@/components/lead-stage-select';
import { DeleteLeadButton } from '@/components/delete-lead-button';

export default async function CrmPage() {
  const supabase = createSupabaseServerClient();
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .returns<Lead[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Santé CRM</h1>
        <Link
          href="/dashboard/crm/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Novo lead
        </Link>
      </div>

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
