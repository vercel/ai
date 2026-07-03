import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CashAdvance, Profile } from '@/lib/types';
import { CashAdvanceStatusSelect } from '@/components/cash-advance-status-select';
import { DeleteCashAdvanceButton } from '@/components/delete-cash-advance-button';

type CashAdvanceRow = CashAdvance & { profiles: Pick<Profile, 'full_name'> | null };

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function CashAdvancesPage() {
  const supabase = createSupabaseServerClient();
  const { data: advances } = await supabase
    .from('cash_advances')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false })
    .returns<CashAdvanceRow[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Adiantamentos</h1>
        <Link
          href="/dashboard/cash-advances/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Nova solicitação
        </Link>
      </div>

      <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Controle interno de solicitações de adiantamento. A antecipação real de recebíveis
        depende de integração com uma instituição financeira, ainda não configurada — esta tela
        registra apenas o pedido e seu status.
      </p>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Solicitante</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Observações</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(advances ?? []).map((advance) => (
              <tr key={advance.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {advance.profiles?.full_name ?? '-'}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {formatCurrency(advance.amount_cents)}
                </td>
                <td className="px-4 py-3 text-gray-500">{advance.notes ?? '-'}</td>
                <td className="px-4 py-3">
                  <CashAdvanceStatusSelect id={advance.id} status={advance.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteCashAdvanceButton id={advance.id} />
                </td>
              </tr>
            ))}
            {(advances ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma solicitação cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
