import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import type { Clinic, Plan, Subscription } from '@/lib/types';

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type ClinicRow = Clinic & { plans: Plan; subscriptions: Subscription[] };

export default async function SuperAdminPage() {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data: clinics } = await supabase
    .from('clinics')
    .select('*, plans(*), subscriptions(*)')
    .order('created_at', { ascending: false })
    .returns<ClinicRow[]>();

  const rows = clinics ?? [];

  const activeRows = rows.filter((c) => {
    const sub = c.subscriptions?.[0];
    return sub && ['active', 'trialing'].includes(sub.status);
  });

  const mrr = activeRows.reduce((sum, c) => sum + (c.plans?.price_cents ?? 0), 0);

  const byStatus = rows.reduce<Record<string, number>>((acc, c) => {
    const status = c.subscriptions?.[0]?.status ?? 'sem assinatura';
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  const metrics = [
    { label: 'Total de clínicas', value: rows.length },
    { label: 'MRR', value: formatBRL(mrr) },
    { label: 'Ativas', value: activeRows.length },
    { label: 'Inadimplentes', value: byStatus['past_due'] ?? 0 },
    { label: 'Suspensas', value: byStatus['suspended'] ?? 0 },
    { label: 'Trial', value: byStatus['trialing'] ?? 0 },
  ];

  const planDist = rows.reduce<Record<string, number>>((acc, c) => {
    const name = c.plans?.name ?? 'Sem plano';
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Visão geral da plataforma</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-400">{m.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-800">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Distribuição por plano</h2>
        <div className="flex flex-wrap gap-4">
          {Object.entries(planDist).map(([plan, count]) => (
            <div key={plan} className="rounded-lg bg-brand-50 px-4 py-3">
              <p className="text-xs text-brand-600">{plan}</p>
              <p className="text-xl font-bold text-brand-700">{count}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Clínica</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criada em</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const sub = c.subscriptions?.[0];
              return (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.plans?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      sub?.status === 'active' ? 'bg-green-100 text-green-700' :
                      sub?.status === 'trialing' ? 'bg-blue-100 text-blue-700' :
                      sub?.status === 'past_due' ? 'bg-amber-100 text-amber-700' :
                      sub?.status === 'suspended' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {sub?.status ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
