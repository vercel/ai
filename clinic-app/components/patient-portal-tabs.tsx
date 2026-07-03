'use client';

import { useState } from 'react';
import { Calendar, Clock, FileText, Wallet, Download } from 'lucide-react';
import { getPortalAttachmentUrl } from '@/app/p/[token]/actions';

export interface PortalAppointment {
  id: string;
  scheduled_at: string;
  status: string;
  appointment_type: string | null;
  professional_name: string;
  professional_specialty: string | null;
}

export interface PortalPrescription {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  signed_at: string | null;
}

export interface PortalCertificate {
  id: string;
  content: string;
  created_at: string;
  signed_at: string | null;
}

export interface PortalDocument {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  created_at: string;
}

export interface PortalInvoice {
  id: string;
  amount_cents: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  fiscal_note: { number: string | null; pdf_url: string | null; status: string } | null;
}

type TabId = 'consultas' | 'documentos' | 'financeiro';

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  agendado: { label: 'Agendado', className: 'bg-blue-50 text-blue-700 ring-blue-100' },
  confirmado: { label: 'Confirmado', className: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
  in_progress: { label: 'Em atendimento', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
  concluido: { label: 'Concluído', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  cancelado: { label: 'Cancelado', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
  no_show: { label: 'Não compareceu', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-600 ring-slate-200',
  };
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function AppointmentCard({ appointment, dimmed }: { appointment: PortalAppointment; dimmed?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
        dimmed ? 'opacity-90' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{appointment.professional_name}</p>
          <p className="mt-0.5 truncate text-sm text-slate-400">
            {appointment.professional_specialty || appointment.appointment_type || 'Consulta'}
          </p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
        <span className="flex items-center gap-1.5">
          <Calendar size={15} className="text-slate-400" />
          {formatDate(appointment.scheduled_at)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={15} className="text-slate-400" />
          {formatTime(appointment.scheduled_at)}
        </span>
      </div>
    </div>
  );
}

function GeneratedPdfLink({
  token,
  documentId,
  documentType,
  label,
}: {
  token: string;
  documentId: string;
  documentType: 'prescription' | 'certificate';
  label: string;
}) {
  return (
    <a
      href={`/api/portal/documents/generate-pdf?token=${encodeURIComponent(token)}&document_id=${documentId}&type=${documentType}`}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
    >
      <Download size={14} />
      {label}
    </a>
  );
}

function DownloadButton({ token, path }: { token: string; path: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const url = await getPortalAttachmentUrl(token, path);
        setLoading(false);
        if (url) window.open(url, '_blank');
      }}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
    >
      <Download size={14} />
      {loading ? 'Gerando...' : 'Baixar PDF'}
    </button>
  );
}

const NAV_ITEMS: { id: TabId; label: string; icon: typeof Calendar }[] = [
  { id: 'consultas', label: 'Consultas', icon: Calendar },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'financeiro', label: 'Financeiro', icon: Wallet },
];

export function PatientPortalTabs({
  token,
  patientName,
  appointments,
  prescriptions,
  certificates,
  documents,
  invoices,
}: {
  token: string;
  patientName: string;
  appointments: PortalAppointment[];
  prescriptions: PortalPrescription[];
  certificates: PortalCertificate[];
  documents: PortalDocument[];
  invoices: PortalInvoice[];
}) {
  const [tab, setTab] = useState<TabId>('consultas');
  const now = Date.now();
  const upcoming = appointments.filter((a) => new Date(a.scheduled_at).getTime() >= now);
  const past = appointments.filter((a) => new Date(a.scheduled_at).getTime() < now);
  const firstName = patientName.split(' ')[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 pb-28 pt-8 md:px-8 md:pb-12">
        {/* Greeting */}
        <header className="mb-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white shadow-sm">
              {initials(patientName)}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Portal do paciente
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                Olá, {firstName}
              </h1>
            </div>
          </div>

          {/* Desktop nav — elegant pill tabs */}
          <nav className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm md:flex">
            {NAV_ITEMS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    active ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <item.icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        {tab === 'consultas' && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Próximas consultas
              </h2>
              <div className="flex flex-col gap-3">
                {upcoming.map((a) => (
                  <AppointmentCard key={a.id} appointment={a} />
                ))}
                {upcoming.length === 0 && <EmptyState text="Nenhuma consulta agendada." />}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Histórico
              </h2>
              <div className="flex flex-col gap-3">
                {past.map((a) => (
                  <AppointmentCard key={a.id} appointment={a} dimmed />
                ))}
                {past.length === 0 && <EmptyState text="Nenhuma consulta anterior." />}
              </div>
            </section>
          </div>
        )}

        {tab === 'documentos' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DocumentSection
              title="Receitas"
              subtitle="Documentos digitais emitidos e assinados no sistema."
              empty="Nenhuma receita registrada."
              count={prescriptions.length}
            >
              {prescriptions.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{p.title}</p>
                      {p.description && <p className="mt-1 text-sm text-slate-500">{p.description}</p>}
                      <p className="mt-2 text-xs text-slate-400">{formatDate(p.created_at)}</p>
                    </div>
                    {p.signed_at ? (
                      <GeneratedPdfLink token={token} documentId={p.id} documentType="prescription" label="Baixar PDF" />
                    ) : (
                      <PendingBadge />
                    )}
                  </div>
                </div>
              ))}
            </DocumentSection>

            <DocumentSection
              title="Atestados"
              subtitle="Documentos digitais emitidos e assinados no sistema."
              empty="Nenhum atestado registrado."
              count={certificates.length}
            >
              {certificates.map((c) => (
                <div key={c.id} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">{c.content}</p>
                      <p className="mt-2 text-xs text-slate-400">{formatDate(c.created_at)}</p>
                    </div>
                    {c.signed_at ? (
                      <GeneratedPdfLink token={token} documentId={c.id} documentType="certificate" label="Baixar PDF" />
                    ) : (
                      <PendingBadge />
                    )}
                  </div>
                </div>
              ))}
            </DocumentSection>

            <DocumentSection
              title="Outros documentos"
              subtitle="Arquivos anexados manualmente pela clínica."
              empty="Nenhum documento disponível."
              count={documents.length}
              className="lg:col-span-2"
            >
              {documents.map((d) => (
                <div key={d.id} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{d.title}</p>
                      {d.description && <p className="mt-1 text-sm text-slate-500">{d.description}</p>}
                      <p className="mt-2 text-xs text-slate-400">{formatDate(d.created_at)}</p>
                    </div>
                    {d.file_url && <DownloadButton token={token} path={d.file_url} />}
                  </div>
                </div>
              ))}
            </DocumentSection>
          </div>
        )}

        {tab === 'financeiro' && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recibos e notas fiscais
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-800">{formatBRL(invoice.amount_cents)}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDate(invoice.created_at)}
                        {invoice.paid_at && ` · pago em ${formatDate(invoice.paid_at)}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                        invoice.status === 'pago'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                          : invoice.status === 'cancelado'
                            ? 'bg-rose-50 text-rose-700 ring-rose-100'
                            : 'bg-amber-50 text-amber-700 ring-amber-100'
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </div>
                  {invoice.fiscal_note?.pdf_url && (
                    <a
                      href={invoice.fiscal_note.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                    >
                      <Download size={14} />
                      Nota fiscal {invoice.fiscal_note.number ?? ''}
                    </a>
                  )}
                </div>
              ))}
              {invoices.length === 0 && <EmptyState text="Nenhum lançamento financeiro." />}
            </div>
          </section>
        )}
      </div>

      {/* Mobile nav — iOS-style translucent bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/80 pb-safe backdrop-blur-lg md:hidden">
        <div className="mx-auto flex max-w-md">
          {NAV_ITEMS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                  active ? 'text-brand-600' : 'text-slate-400'
                }`}
              >
                <item.icon size={22} strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 p-6 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

function PendingBadge() {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
      Aguardando assinatura
    </span>
  );
}

function DocumentSection({
  title,
  subtitle,
  empty,
  count,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  empty: string;
  count: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <p className="mb-3 mt-0.5 text-xs text-slate-400">{subtitle}</p>
      <div className="flex flex-col gap-3">
        {count === 0 ? <EmptyState text={empty} /> : children}
      </div>
    </section>
  );
}
