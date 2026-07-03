import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DocumentSignature, Patient } from '@/lib/types';
import { SignatureActions } from '@/components/signature-actions';

type SignatureRow = DocumentSignature & { patients: Pick<Patient, 'full_name'> | null };

const STATUS_LABELS: Record<DocumentSignature['status'], string> = {
  pendente: 'Pendente',
  assinado: 'Assinado',
  cancelado: 'Cancelado',
};

const STATUS_COLORS: Record<DocumentSignature['status'], string> = {
  pendente: 'bg-amber-50 text-amber-700',
  assinado: 'bg-green-50 text-green-700',
  cancelado: 'bg-gray-100 text-gray-600',
};

export default async function SignaturesPage() {
  const supabase = createSupabaseServerClient();
  const { data: signatures } = await supabase
    .from('document_signatures')
    .select('*, patients(full_name)')
    .order('created_at', { ascending: false })
    .returns<SignatureRow[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Assinatura eletrônica</h1>
        <Link
          href="/dashboard/signatures/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Solicitar assinatura
        </Link>
      </div>

      <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Controle interno de solicitações de assinatura (anamnese, contratos, termos). A
        assinatura digital com validade jurídica real depende de um provedor de assinatura
        eletrônica/certificado digital, ainda não configurado — por enquanto, marcar como
        "assinado" é apenas um registro manual.
      </p>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(signatures ?? []).map((s) => (
              <tr key={s.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{s.title}</td>
                <td className="px-4 py-3 text-gray-500">{s.patients?.full_name ?? '-'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLORS[s.status]}`}>
                    {STATUS_LABELS[s.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <SignatureActions id={s.id} status={s.status} />
                </td>
              </tr>
            ))}
            {(signatures ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma solicitação de assinatura cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
