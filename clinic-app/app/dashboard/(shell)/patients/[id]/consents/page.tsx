import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ConsentForm, Patient } from '@/lib/types';
import { SignConsentButton } from '@/components/sign-consent-button';
import { DeleteConsentButton } from '@/components/delete-consent-button';

export default async function ConsentsPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('id', params.id)
    .single<Patient>();

  if (!patient) {
    notFound();
  }

  const { data: consents } = await supabase
    .from('consent_forms')
    .select('*')
    .eq('patient_id', params.id)
    .order('created_at', { ascending: false })
    .returns<ConsentForm[]>();

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">
            Termos de consentimento · {patient.full_name}
          </h1>
          <Link
            href={`/dashboard/patients/${patient.id}`}
            className="text-sm text-brand-600 hover:underline"
          >
            ← Voltar ao prontuário
          </Link>
        </div>
        <Link
          href={`/dashboard/patients/${patient.id}/consents/new`}
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Novo termo
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {(consents ?? []).map((consent) => (
          <div key={consent.id} className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-start justify-between">
              <h2 className="text-sm font-semibold text-gray-800">{consent.title}</h2>
              {!consent.signed_at && (
                <DeleteConsentButton patientId={patient.id} consentId={consent.id} />
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-gray-600">{consent.content}</p>

            {consent.signed_at ? (
              <div className="mt-3 flex items-center gap-2 rounded bg-green-50 px-3 py-2">
                {consent.signature_data && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={consent.signature_data} alt="assinatura" className="h-8" />
                )}
                <p className="text-[11px] text-green-700">
                  Assinado por {consent.signer_name} em{' '}
                  {new Date(consent.signed_at).toLocaleString('pt-BR')} · hash{' '}
                  {consent.content_hash?.slice(0, 12)}…
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <SignConsentButton patientId={patient.id} consentId={consent.id} />
              </div>
            )}
          </div>
        ))}
        {(consents ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhum termo cadastrado ainda.</p>
        )}
      </div>
    </div>
  );
}
