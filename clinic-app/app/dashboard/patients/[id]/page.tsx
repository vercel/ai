import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { MedicalRecord, Patient, Profile } from '@/lib/types';
import { addMedicalRecord } from '../actions';
import { AttachmentLink } from '@/components/attachment-link';
import { SignRecordButton } from '@/components/sign-record-button';
import { requireProfile } from '@/lib/auth';

export default async function PatientDetailPage({ params }: { params: { id: string } }) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('id', params.id)
    .single<Patient>();

  if (!patient) {
    notFound();
  }

  const { data: records } = await supabase
    .from('medical_records')
    .select('*, profiles(full_name)')
    .eq('patient_id', params.id)
    .order('created_at', { ascending: false })
    .returns<(MedicalRecord & { profiles: Pick<Profile, 'full_name'> })[]>();

  const addRecord = addMedicalRecord.bind(null, params.id);

  return (
    <div className="max-w-2xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">{patient.full_name}</h1>
        <div className="flex gap-4">
          <Link
            href={`/dashboard/patients/${patient.id}/consents`}
            className="text-sm text-brand-600 hover:underline"
          >
            Termos de consentimento
          </Link>
          <Link href={`/dashboard/patients/${patient.id}/edit`} className="text-sm text-brand-600 hover:underline">
            Editar dados
          </Link>
        </div>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        {patient.phone ?? 'Sem telefone'} · {patient.email ?? 'Sem e-mail'}
      </p>

      <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Nova entrada no prontuário</h2>
        <form action={addRecord} encType="multipart/form-data" className="flex flex-col gap-3">
          <textarea
            name="entry"
            required
            rows={4}
            placeholder="Anotações clínicas..."
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="text-sm text-gray-600">
            Anexo (exame, documento, imagem)
            <input
              name="attachment"
              type="file"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Adicionar
          </button>
        </form>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Histórico</h2>
      <div className="flex flex-col gap-3">
        {(records ?? []).map((record) => (
          <div key={record.id} className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-800">{record.entry}</p>
            {record.attachments?.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {record.attachments.map((path) => (
                  <AttachmentLink key={path} path={path} />
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-gray-400">
              {record.profiles?.full_name} · {new Date(record.created_at).toLocaleString('pt-BR')}
            </p>
            {record.signed_at ? (
              <div className="mt-2 flex items-center gap-2 rounded bg-green-50 px-2 py-1">
                {record.signature_data && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={record.signature_data} alt="assinatura" className="h-8" />
                )}
                <p className="text-[11px] text-green-700">
                  Assinado digitalmente em {new Date(record.signed_at).toLocaleString('pt-BR')} ·
                  hash {record.content_hash?.slice(0, 12)}…
                </p>
              </div>
            ) : (
              record.professional_id === profile.id && (
                <SignRecordButton patientId={patient.id} recordId={record.id} />
              )
            )}
          </div>
        ))}
        {(records ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhuma entrada no prontuário ainda.</p>
        )}
      </div>
    </div>
  );
}
