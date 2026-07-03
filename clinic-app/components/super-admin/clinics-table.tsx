'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MoreVertical, Ban, CheckCircle2, Eye, FileText, LogIn, ChevronDown } from 'lucide-react';
import { InvoicesModal } from './invoices-modal';

export type ClinicOverviewRow = {
  clinic_id: string;
  name: string;
  owner_email: string | null;
  is_active: boolean;
  created_at: string;
  plan_id: string | null;
  plan_name: string | null;
  price_cents: number | null;
  subscription_status: string | null;
  current_period_end: string | null;
  past_due_since: string | null;
  subscription_updated_at: string | null;
};

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'active', label: 'Ativa' },
  { value: 'pending_payment', label: 'Aguardando pagamento' },
  { value: 'past_due_suspended', label: 'Inadimplente' },
  { value: 'trialing', label: 'Trial' },
  { value: 'canceled', label: 'Cancelada' },
];

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400',
  pending_payment: 'bg-purple-500/10 text-purple-400',
  trialing: 'bg-blue-500/10 text-blue-400',
  past_due: 'bg-amber-500/10 text-amber-400',
  suspended: 'bg-red-500/10 text-red-400',
  canceled: 'bg-slate-500/10 text-slate-400',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  pending_payment: 'Aguardando pagamento',
  trialing: 'Trial',
  past_due: 'Em atraso',
  suspended: 'Suspenso',
  canceled: 'Cancelado',
};

function formatBRL(cents: number | null) {
  if (cents === null) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ClinicsTable({
  rows,
  suspendClinicAction,
  activateClinicAction,
  startImpersonationAction,
}: {
  rows: ClinicOverviewRow[];
  suspendClinicAction: (clinicId: string) => Promise<void>;
  activateClinicAction: (clinicId: string) => Promise<void>;
  startImpersonationAction: (clinicId: string, formData: FormData) => Promise<void>;
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [invoicesFor, setInvoicesFor] = useState<{ id: string; name: string } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredRows = rows.filter((row) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'past_due_suspended') {
      return row.subscription_status === 'past_due' || row.subscription_status === 'suspended';
    }
    return row.subscription_status === statusFilter;
  });

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <div>
          <p className="text-sm font-semibold text-white">Gerenciamento de clínicas</p>
          <p className="text-xs text-slate-500">{filteredRows.length} de {rows.length} clínicas</p>
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none rounded-lg border border-white/10 bg-slate-800 py-2 pl-3 pr-8 text-xs font-medium text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3 font-medium">Clínica</th>
              <th className="px-6 py-3 font-medium">Gestor</th>
              <th className="px-6 py-3 font-medium">Plano</th>
              <th className="px-6 py-3 font-medium">Status financeiro</th>
              <th className="px-6 py-3 font-medium">Próximo vencimento</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const status = row.subscription_status ?? 'canceled';
              const isSuspendedOrInactive = !row.is_active || status === 'suspended';
              return (
                <tr key={row.clinic_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-200">{row.name}</p>
                    <p className="font-mono text-[11px] text-slate-600">{row.clinic_id.slice(0, 8)}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{row.owner_email ?? '—'}</td>
                  <td className="px-6 py-4">
                    <p className="text-slate-300">{row.plan_name ?? '—'}</p>
                    <p className="text-xs text-slate-500">{formatBRL(row.price_cents)}/mês</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-slate-500/10 text-slate-400'}`}>
                      {STATUS_LABEL[status] ?? status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {row.current_period_end
                      ? new Date(row.current_period_end).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="relative px-6 py-4 text-right">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === row.clinic_id ? null : row.clinic_id)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {openMenuId === row.clinic_id && (
                      <div
                        ref={menuRef}
                        className="absolute right-6 top-12 z-10 w-56 rounded-xl border border-white/10 bg-slate-800 py-1.5 shadow-xl"
                      >
                        <Link
                          href={`/super-admin/clinics/${row.clinic_id}`}
                          onClick={() => setOpenMenuId(null)}
                          className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5"
                        >
                          <Eye className="h-4 w-4" />
                          Ver detalhes
                        </Link>

                        {isSuspendedOrInactive ? (
                          <form
                            action={async () => {
                              setOpenMenuId(null);
                              await activateClinicAction(row.clinic_id);
                            }}
                          >
                            <button
                              type="submit"
                              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-emerald-400 hover:bg-white/5"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Reativar acesso
                            </button>
                          </form>
                        ) : (
                          <form
                            action={async () => {
                              setOpenMenuId(null);
                              await suspendClinicAction(row.clinic_id);
                            }}
                          >
                            <button
                              type="submit"
                              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-red-400 hover:bg-white/5"
                            >
                              <Ban className="h-4 w-4" />
                              Suspender acesso
                            </button>
                          </form>
                        )}

                        <button
                          onClick={() => {
                            setOpenMenuId(null);
                            setInvoicesFor({ id: row.clinic_id, name: row.name });
                          }}
                          className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5"
                        >
                          <FileText className="h-4 w-4" />
                          Ver faturas
                        </button>

                        <form
                          action={startImpersonationAction.bind(null, row.clinic_id)}
                          onSubmit={() => setOpenMenuId(null)}
                        >
                          <input type="hidden" name="reason" value="Suporte técnico via Centro de Comando" />
                          <button
                            type="submit"
                            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5"
                          >
                            <LogIn className="h-4 w-4" />
                            Acessar como cliente
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                  Nenhuma clínica encontrada para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {invoicesFor && (
        <InvoicesModal
          clinicId={invoicesFor.id}
          clinicName={invoicesFor.name}
          onClose={() => setInvoicesFor(null)}
        />
      )}
    </div>
  );
}
