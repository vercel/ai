import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import type { Clinic, Plan, Subscription } from '@/lib/types';

type ClinicRow = Clinic & { plans: Plan; subscriptions: Subscription[] };

export default async function SuperAdminClinicsPage({
  searchParams,
}: {
  searchParams: { status?: string; plan?: string };
}) {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data: clinics } = await supabase
    .from('clinics')
    .select('*, plans(*), subscriptions(*)')
    .order('created_at', { ascending: false })
    .returns<ClinicRow[]>();

  const { data: plans } = await supabase.from('plans').select('id, name').returns<{ id: string; name: string }[]>();

  let rows = clinics ?? [];
  if (searchParams.status) {
    rows = rows.filter((c) => c.subscriptions?.[0]?.status === searchParams.status);
  }
  if (searchParams.plan) {
    rows = rows.filter((c) => c.plans?.name === searchParams.plan);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Clínicas</h1>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="text-gray-400 self-center">Filtrar:</span>
        {['trialing', 'active', 'past_due', 'suspended'].map((s) => (
          <Link
            key={s}
            href={`/super-admin/clinics?status=${s}`}
            className={`rounded-full border px-3 py-1 ${
              searchParams.status === s
                ? 'border-brand-600 bg-brand-50 text-brand-600'
                : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            {s}
          </Link>
        ))}
        {(plans ?? []).map((p) => (
          <Link
            key={p.id}
            href={`/super-admin/clinics?plan=${p.name}`}
            className={`rounded-full border px-3 py-1 ${
              searchParams.plan === p.name
                ? 'border-brand-600 bg-brand-50 text-brand-600'
                : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            {p.name}
          </Link>
        ))}
        {(searchParams.status || searchParams.plan) && (
          <Link href="/super-admin/clinics" className="rounded-full border border-gray-200 px-3 py-1 text-gray-400 hover:border-gray-400">
            limpar
          </Link>
        )}
      </div>

      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Clínica</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criada em</th>
              <th className="px-4 py-3"></th>
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
                  <td className="px-4 py-3">
                    <Link
                      href={`/super-admin/clinics/${c.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      Gerenciar →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Nenhuma clínica encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
