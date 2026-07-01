'use client';

import { useState } from 'react';
import { Calendar, FileText, Wallet, Download, Clock } from 'lucide-react';
import { getPortalAttachmentUrl } from '@/app/p/[token]/actions';

export interface PortalAppointment {
  id: string;
  scheduled_at: string;
  status: string;
  appointment_type: string | null;
  professional_name: string;
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

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  in_progress: 'Em atendimento',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
      className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700"
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
      className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700"
    >
      <Download size={14} />
      {loading ? 'Gerando...' : 'Baixar PDF'}
    </button>
  );
}

export function PatientPortalTabs({
  token,
  appointments,
  prescriptions,
  certificates,
  documents,
  invoices,
}: {
  token: string;
  appointments: PortalAppointment[];
  prescriptions: PortalPrescription[];
  certificates: PortalCertificate[];
  documents: PortalDocument[];
  invoices: PortalInvoice[];
}) {
  const [tab, setTab] = useState<'consultas' | 'documentos' | 'financeiro'>('consultas');
  const now = Date.now();
  const upcoming = appointments.filter((a) => new Date(a.scheduled_at).getTime() >= now);
  const past = appointments.filter((a) => new Date(a.scheduled_at).getTime() < now);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        {tab === 'consultas' && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Próximas consultas</h2>
              <div className="flex flex-col gap-2">
                {upcoming.map((a) => (
                  <div key={a.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{a.professional_name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                          <Clock size={12} />
                          {new Date(a.scheduled_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                        {STATUS_LABELS[a.status] ?? a.status}
                      </span>
                    </div>
                  </div>
                ))}
                {upcoming.length === 0 && (
                  <p className="text-sm text-gray-400">Nenhuma consulta agendada.</p>
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Histórico</h2>
              <div className="flex flex-col gap-2">
                {past.map((a) => (
                  <div key={a.id} className="rounded-xl bg-white p-4 shadow-sm opacity-80">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{a.professional_name}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {new Date(a.scheduled_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {STATUS_LABELS[a.status] ?? a.status}
                      </span>
                    </div>
                  </div>
                ))}
                {past.length === 0 && (
                  <p className="text-sm text-gray-400">Nenhuma consulta anterior.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'documentos' && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Receitas</h2>
              <p className="mb-2 text-xs text-gray-400">Documentos digitais emitidos e assinados no sistema.</p>
              <div className="flex flex-col gap-2">
                {prescriptions.map((p) => (
                  <div key={p.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.title}</p>
                        {p.description && <p className="mt-1 text-sm text-gray-600">{p.description}</p>}
                        <p className="mt-2 text-xs text-gray-400">
                          {new Date(p.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      {p.signed_at ? (
                        <GeneratedPdfLink
                          token={token}
                          documentId={p.id}
                          documentType="prescription"
                          label="Baixar PDF"
                        />
                      ) : (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          Aguardando assinatura
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {prescriptions.length === 0 && (
                  <p className="text-sm text-gray-400">Nenhuma receita registrada.</p>
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Atestados</h2>
              <p className="mb-2 text-xs text-gray-400">Documentos digitais emitidos e assinados no sistema.</p>
              <div className="flex flex-col gap-2">
                {certificates.map((c) => (
                  <div key={c.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm text-gray-800">{c.content}</p>
                        <p className="mt-2 text-xs text-gray-400">
                          {new Date(c.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      {c.signed_at ? (
                        <GeneratedPdfLink
                          token={token}
                          documentId={c.id}
                          documentType="certificate"
                          label="Baixar PDF"
                        />
                      ) : (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          Aguardando assinatura
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {certificates.length === 0 && (
                  <p className="text-sm text-gray-400">Nenhum atestado registrado.</p>
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Outros documentos</h2>
              <p className="mb-2 text-xs text-gray-400">Arquivos anexados manualmente pela clínica.</p>
              <div className="flex flex-col gap-2">
                {documents.map((d) => (
                  <div key={d.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{d.title}</p>
                        {d.description && <p className="mt-1 text-sm text-gray-600">{d.description}</p>}
                        <p className="mt-2 text-xs text-gray-400">
                          {new Date(d.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      {d.file_url && <DownloadButton token={token} path={d.file_url} />}
                    </div>
                  </div>
                ))}
                {documents.length === 0 && (
                  <p className="text-sm text-gray-400">Nenhum documento disponível.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'financeiro' && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Recibos e notas fiscais</h2>
            <div className="flex flex-col gap-2">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {formatBRL(invoice.amount_cents)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {new Date(invoice.created_at).toLocaleDateString('pt-BR')}
                        {invoice.paid_at &&
                          ` · pago em ${new Date(invoice.paid_at).toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                      {invoice.status}
                    </span>
                  </div>
                  {invoice.fiscal_note?.pdf_url && (
                    <a
                      href={invoice.fiscal_note.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700"
                    >
                      <Download size={14} />
                      Nota fiscal {invoice.fiscal_note.number ?? ''}
                    </a>
                  )}
                </div>
              ))}
              {invoices.length === 0 && (
                <p className="text-sm text-gray-400">Nenhum lançamento financeiro.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 flex border-t border-gray-200 bg-white pb-safe">
        <TabButton
          active={tab === 'consultas'}
          label="Consultas"
          icon={<Calendar size={20} />}
          onClick={() => setTab('consultas')}
        />
        <TabButton
          active={tab === 'documentos'}
          label="Documentos"
          icon={<FileText size={20} />}
          onClick={() => setTab('documentos')}
        />
        <TabButton
          active={tab === 'financeiro'}
          label="Financeiro"
          icon={<Wallet size={20} />}
          onClick={() => setTab('financeiro')}
        />
      </nav>
    </div>
  );
}

function TabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium ${
        active ? 'text-brand-600' : 'text-gray-400'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
