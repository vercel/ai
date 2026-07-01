'use client';

import { useEffect, useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type SaasInvoice = {
  id: string;
  gateway_invoice_id: string | null;
  amount_cents: number | null;
  status: 'paid' | 'open' | 'failed';
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
};

function formatBRL(cents: number | null) {
  if (cents === null) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_STYLE: Record<SaasInvoice['status'], string> = {
  paid: 'bg-emerald-500/10 text-emerald-400',
  open: 'bg-amber-500/10 text-amber-400',
  failed: 'bg-red-500/10 text-red-400',
};

const STATUS_LABEL: Record<SaasInvoice['status'], string> = {
  paid: 'Pago',
  open: 'Em aberto',
  failed: 'Falhou',
};

export function InvoicesModal({
  clinicId,
  clinicName,
  onClose,
}: {
  clinicId: string;
  clinicName: string;
  onClose: () => void;
}) {
  const [invoices, setInvoices] = useState<SaasInvoice[] | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase
      .from('saas_invoices')
      .select('id, gateway_invoice_id, amount_cents, status, due_date, paid_at, created_at')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .returns<SaasInvoice[]>()
      .then(({ data }) => setInvoices(data ?? []));
  }, [clinicId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-white">Faturas · {clinicName}</p>
            <p className="text-xs text-slate-500">Histórico de cobranças da assinatura SaaS</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto px-6 py-4">
          {invoices === null && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando faturas...
            </div>
          )}

          {invoices?.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-500">
              <FileText className="h-6 w-6 text-slate-600" />
              Nenhuma fatura registrada ainda.
            </div>
          )}

          {invoices && invoices.length > 0 && (
            <div className="flex flex-col gap-2">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-200">{formatBRL(inv.amount_cents)}</p>
                    <p className="text-xs text-slate-500">
                      {inv.due_date
                        ? `Vencimento: ${new Date(inv.due_date).toLocaleDateString('pt-BR')}`
                        : new Date(inv.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[inv.status]}`}>
                    {STATUS_LABEL[inv.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
