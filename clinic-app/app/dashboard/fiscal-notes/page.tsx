import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { FiscalNote, Invoice, Patient } from '@/lib/types';
import { FiscalNoteActions } from '@/components/fiscal-note-actions';

type FiscalNoteRow = FiscalNote & {
  invoices: Pick<Invoice, 'amount_cents'> & { patients: Pick<Patient, 'full_name'> };
};

const STATUS_LABELS: Record<FiscalNote['status'], string> = {
  pendente: 'Pendente',
  emitida: 'Emitida',
  cancelada: 'Cancelada',
};

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function FiscalNotesPage() {
  const supabase = createSupabaseServerClient();
  const { data: notes } = await supabase
    .from('fiscal_notes')
    .select('*, invoices(amount_cents, patients(full_name))')
    .order('created_at', { ascending: false })
    .returns<FiscalNoteRow[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Notas fiscais</h1>
        <Link
          href="/dashboard/fiscal-notes/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Nova nota
        </Link>
      </div>

      <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Controle interno de notas fiscais vinculadas às faturas. A emissão real (SEFAZ/NFe)
        depende de um certificado digital e provedor de emissão, ainda não configurados — por
        isso, esta tela é apenas um registro de número/série/status.
      </p>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Número/Série</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(notes ?? []).map((note) => (
              <tr key={note.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {note.invoices?.patients?.full_name}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {formatCurrency(note.invoices?.amount_cents ?? 0)}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {note.number ?? '-'} {note.series ? `/ ${note.series}` : ''}
                </td>
                <td className="px-4 py-3 text-gray-500">{STATUS_LABELS[note.status]}</td>
                <td className="px-4 py-3 text-right">
                  <FiscalNoteActions id={note.id} status={note.status} />
                </td>
              </tr>
            ))}
            {(notes ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma nota fiscal cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
