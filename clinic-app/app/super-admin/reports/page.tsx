import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import type { ClinicOverviewRow } from '@/components/super-admin/clinics-table';

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  trialing: 'Trial',
  past_due: 'Em atraso',
  suspended: 'Suspenso',
  canceled: 'Cancelado',
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  paid: 'Pago',
  open: 'Em aberto',
  failed: 'Falhou',
};

const INVOICE_STATUS_STYLE: Record<string, string> = {
  paid: 'bg-emerald-500/10 text-emerald-400',
  open: 'bg-amber-500/10 text-amber-400',
  failed: 'bg-red-500/10 text-red-400',
};

type SaasInvoiceRow = {
  id: string;
  clinic_id: string;
  amount_cents: number | null;
  status: 'paid' | 'open' | 'failed';
  due_date: string | null;
  created_at: string;
};

export default async function SuperAdminReportsPage() {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const [{ data: clinicsData }, { data: invoicesData }] = await Promise.all([
    supabase.rpc('super_admin_clinics_overview'),
    supabase
      .from('saas_invoices')
      .select('id, clinic_id, amount_cents, status, due_date, created_at')
      .order('created_at', { ascending: false })
      .returns<SaasInvoiceRow[]>(),
  ]);

  const rows = (clinicsData ?? []) as ClinicOverviewRow[];
  const invoices = invoicesData ?? [];
  const clinicNameById = new Map(rows.map((r) => [r.clinic_id, r.name]));

  // Revenue by plan
  const revenueByPlan = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    if (r.subscription_status !== 'active' && r.subscription_status !== 'trialing') continue;
    const key = r.plan_name ?? 'Sem plano';
    const current = revenueByPlan.get(key) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += r.price_cents ?? 0;
    revenueByPlan.set(key, current);
  }

  // Status breakdown
  const statusCounts = new Map<string, number>();
  for (const r of rows) {
    const key = r.subscription_status ?? 'sem_assinatura';
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }

  // Signups by month (last 6 months)
  const months: { key: string; label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short' });
    months.push({ key, label, count: 0 });
  }
  for (const r of rows) {
    const d = new Date(r.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const month = months.find((m) => m.key === key);
    if (month) month.count += 1;
  }
  const maxSignups = Math.max(1, ...months.map((m) => m.count));

  const paidTotal = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + (i.amount_cents ?? 0), 0);
  const openTotal = invoices.filter((i) => i.status === 'open').reduce((s, i) => s + (i.amount_cents ?? 0), 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Relatório completo</h1>
        <p className="text-sm text-slate-500">Visão consolidada de receita, crescimento e faturamento de todas as clínicas.</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-5">
          <p className="text-xs text-slate-500">Total recebido (faturas pagas)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{formatBRL(paidTotal)}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-5">
          <p className="text-xs text-slate-500">Em aberto</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{formatBRL(openTotal)}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-5">
          <p className="text-xs text-slate-500">Total de clínicas</p>
          <p className="mt-1 text-2xl font-bold text-white">{rows.length}</p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Receita por plano</h2>
          <div className="flex flex-col gap-3">
            {Array.from(revenueByPlan.entries()).map(([plan, data]) => (
              <div key={plan} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-200">{plan}</p>
                  <p className="text-xs text-slate-500">{data.count} clínica{data.count !== 1 ? 's' : ''}</p>
                </div>
                <p className="font-semibold text-emerald-400">{formatBRL(data.total)}/mês</p>
              </div>
            ))}
            {revenueByPlan.size === 0 && <p className="text-sm text-slate-500">Nenhuma assinatura ativa.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Clínicas por status</h2>
          <div className="flex flex-col gap-3">
            {Array.from(statusCounts.entries()).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{STATUS_LABEL[status] ?? status}</span>
                <span className="font-semibold text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-8 rounded-2xl border border-white/5 bg-slate-900/60 p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-200">Novas clínicas (últimos 6 meses)</h2>
        <div className="flex h-32 items-end gap-3">
          {months.map((m) => (
            <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t bg-gradient-to-t from-emerald-600/40 to-emerald-400"
                style={{ height: `${(m.count / maxSignups) * 100}%`, minHeight: m.count > 0 ? '4px' : '0' }}
              />
              <span className="text-xs text-slate-500">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="border-b border-white/5 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-200">Faturas ({invoices.length})</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3 font-medium">Clínica</th>
              <th className="px-6 py-3 font-medium">Valor</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Vencimento</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-white/5 last:border-0">
                <td className="px-6 py-3 text-slate-300">{clinicNameById.get(inv.clinic_id) ?? '—'}</td>
                <td className="px-6 py-3 text-slate-300">{inv.amount_cents !== null ? formatBRL(inv.amount_cents) : '—'}</td>
                <td className="px-6 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${INVOICE_STATUS_STYLE[inv.status]}`}>
                    {INVOICE_STATUS_LABEL[inv.status]}
                  </span>
                </td>
                <td className="px-6 py-3 text-slate-500">
                  {inv.due_date ? new Date(inv.due_date).toLocaleDateString('pt-BR') : '—'}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-slate-500">
                  Nenhuma fatura registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
