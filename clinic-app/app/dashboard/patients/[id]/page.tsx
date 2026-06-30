import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  MedicalRecord,
  Patient,
  PatientDocument,
  Prescription,
  Profile,
  TherapyPlan,
} from '@/lib/types';
import {
  addMedicalRecord,
  addPatientDocument,
  addPrescription,
  addTherapyPlan,
  toggleDocumentArchive,
  updatePrescriptionStatus,
} from '../actions';
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

  const { data: prescriptions } = await supabase
    .from('prescriptions')
    .select('*')
    .eq('patient_id', params.id)
    .order('created_at', { ascending: false })
    .returns<Prescription[]>();

  const { data: therapyPlans } = await supabase
    .from('therapy_plans')
    .select('*')
    .eq('patient_id', params.id)
    .order('created_at', { ascending: false })
    .returns<TherapyPlan[]>();

  const { data: documents } = await supabase
    .from('patient_documents')
    .select('*')
    .eq('patient_id', params.id)
    .order('created_at', { ascending: false })
    .returns<PatientDocument[]>();

  const addRecord = addMedicalRecord.bind(null, params.id);
  const addPrescriptionAction = addPrescription.bind(null, params.id);
  const addTherapyPlanAction = addTherapyPlan.bind(null, params.id);
  const addDocumentAction = addPatientDocument.bind(null, params.id);

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

      <div className="mt-10 mb-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Nova receita</h2>
        <form action={addPrescriptionAction} className="flex flex-col gap-3">
          <input
            name="title"
            required
            placeholder="Título (ex: Receita de uso contínuo)"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            rows={3}
            placeholder="Detalhes da prescrição..."
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Adicionar
          </button>
        </form>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Receitas</h2>
      <div className="mb-10 flex flex-col gap-3">
        {(prescriptions ?? []).map((prescription) => (
          <div key={prescription.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-gray-800">{prescription.title}</p>
                {prescription.description && (
                  <p className="mt-1 text-sm text-gray-600">{prescription.description}</p>
                )}
              </div>
              <span className="shrink-0 rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                {prescription.status}
              </span>
            </div>
            <form
              action={updatePrescriptionStatus.bind(null, params.id, prescription.id, 'Finalizada')}
              className="mt-2"
            >
              {prescription.status !== 'Finalizada' && (
                <button type="submit" className="text-xs text-brand-600 hover:underline">
                  Marcar como finalizada
                </button>
              )}
            </form>
          </div>
        ))}
        {(prescriptions ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhuma receita cadastrada ainda.</p>
        )}
      </div>

      <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Novo plano terapêutico</h2>
        <form action={addTherapyPlanAction} className="flex flex-col gap-3">
          <input
            name="area"
            placeholder="Área (ex: Fonoaudiologia)"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            name="objetivos"
            rows={3}
            placeholder="Objetivos terapêuticos..."
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-3">
            <label className="flex-1 text-sm text-gray-600">
              Início
              <input
                name="start_date"
                type="date"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex-1 text-sm text-gray-600">
              Revisão
              <input
                name="review_date"
                type="date"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Adicionar
          </button>
        </form>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Planos terapêuticos</h2>
      <div className="mb-10 flex flex-col gap-3">
        {(therapyPlans ?? []).map((plan) => (
          <div key={plan.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-gray-800">{plan.area ?? 'Plano terapêutico'}</p>
              <span className="shrink-0 rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                {plan.status}
              </span>
            </div>
            {plan.objetivos && <p className="mt-1 text-sm text-gray-600">{plan.objetivos}</p>}
            <p className="mt-2 text-xs text-gray-400">
              {plan.start_date && `Início: ${new Date(plan.start_date).toLocaleDateString('pt-BR')}`}
              {plan.review_date &&
                ` · Revisão: ${new Date(plan.review_date).toLocaleDateString('pt-BR')}`}
            </p>
          </div>
        ))}
        {(therapyPlans ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhum plano terapêutico cadastrado ainda.</p>
        )}
      </div>

      <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Novo documento</h2>
        <form action={addDocumentAction} encType="multipart/form-data" className="flex flex-col gap-3">
          <input
            name="title"
            required
            placeholder="Título do documento"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            rows={2}
            placeholder="Descrição (opcional)"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="text-sm text-gray-600">
            Arquivo
            <input
              name="file"
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

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Documentos</h2>
      <div className="flex flex-col gap-3">
        {(documents ?? [])
          .filter((document) => !document.is_archived)
          .map((document) => (
            <div key={document.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">{document.title}</p>
                  {document.description && (
                    <p className="mt-1 text-sm text-gray-600">{document.description}</p>
                  )}
                  {document.file_url && <AttachmentLink path={document.file_url} />}
                </div>
                <form action={toggleDocumentArchive.bind(null, params.id, document.id, true)}>
                  <button type="submit" className="text-xs text-gray-500 hover:underline">
                    Arquivar
                  </button>
                </form>
              </div>
            </div>
          ))}
        {(documents ?? []).filter((document) => !document.is_archived).length === 0 && (
          <p className="text-sm text-gray-400">Nenhum documento cadastrado ainda.</p>
        )}
        {(documents ?? []).some((document) => document.is_archived) && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-gray-400">Documentos arquivados</summary>
            <div className="mt-2 flex flex-col gap-3">
              {(documents ?? [])
                .filter((document) => document.is_archived)
                .map((document) => (
                  <div key={document.id} className="rounded-xl bg-gray-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-600">{document.title}</p>
                        {document.file_url && <AttachmentLink path={document.file_url} />}
                      </div>
                      <form action={toggleDocumentArchive.bind(null, params.id, document.id, false)}>
                        <button type="submit" className="text-xs text-brand-600 hover:underline">
                          Restaurar
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
