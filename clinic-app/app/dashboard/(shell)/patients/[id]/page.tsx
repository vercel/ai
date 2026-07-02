import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  Appointment,
  Invoice,
  MedicalCertificate,
  MedicalRecord,
  MedicalRecordTemplate,
  Patient,
  PatientDocument,
  Prescription,
  Profile,
  Room,
  TherapyPlan,
} from '@/lib/types';
import {
  addMedicalCertificate,
  addMedicalRecord,
  addPatientDocument,
  addPrescription,
  addTherapyPlan,
  toggleDocumentArchive,
  updatePrescriptionStatus,
} from '../actions';
import { AttachmentLink } from '@/components/attachment-link';
import { PatientPortalLinkButton } from '@/components/patient-portal-link-button';
import { SignRecordButton } from '@/components/sign-record-button';
import { SignPrescriptionButton } from '@/components/sign-prescription-button';
import { SignCertificateButton } from '@/components/sign-certificate-button';
import { MedicalRecordEntryForm } from '@/components/medical-record-entry-form';
import { ModalForm } from '@/components/modal-form';
import { Tabs } from '@/components/tabs';
import { requireProfile } from '@/lib/auth';

const THERAPY_AREAS = [
  'Psicologia',
  'Fonoaudiologia',
  'Terapia Ocupacional',
  'Fisioterapia',
  'Psicopedagogia',
  'Psicomotricidade',
  'Terapia ABA',
  'Neuropediatria',
  'Outro',
];

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calculateAge(birthDate: string | null) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

const inputClass = 'rounded border border-gray-300 px-3 py-2 text-sm';
const labelClass = 'text-sm text-gray-600';

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

  const [
    { data: records },
    { data: prescriptions },
    { data: certificates },
    { data: therapyPlans },
    { data: documents },
    { data: appointments },
    { data: invoices },
    { data: templates },
  ] = await Promise.all([
    supabase
      .from('medical_records')
      .select('*, profiles(full_name)')
      .eq('patient_id', params.id)
      .order('created_at', { ascending: false })
      .returns<(MedicalRecord & { profiles: Pick<Profile, 'full_name'> })[]>(),
    supabase
      .from('prescriptions')
      .select('*')
      .eq('patient_id', params.id)
      .order('created_at', { ascending: false })
      .returns<Prescription[]>(),
    supabase
      .from('medical_certificates')
      .select('*')
      .eq('patient_id', params.id)
      .order('created_at', { ascending: false })
      .returns<MedicalCertificate[]>(),
    supabase
      .from('therapy_plans')
      .select('*')
      .eq('patient_id', params.id)
      .order('created_at', { ascending: false })
      .returns<TherapyPlan[]>(),
    supabase
      .from('patient_documents')
      .select('*')
      .eq('patient_id', params.id)
      .order('created_at', { ascending: false })
      .returns<PatientDocument[]>(),
    supabase
      .from('appointments')
      .select('*, profiles(full_name), rooms(name)')
      .eq('patient_id', params.id)
      .order('scheduled_at', { ascending: false })
      .returns<(Appointment & { profiles: Pick<Profile, 'full_name'>; rooms: Pick<Room, 'name'> | null })[]>(),
    supabase
      .from('invoices')
      .select('*')
      .eq('patient_id', params.id)
      .order('created_at', { ascending: false })
      .returns<Invoice[]>(),
    supabase
      .from('medical_record_templates')
      .select('*')
      .order('title')
      .returns<MedicalRecordTemplate[]>(),
  ]);

  const addRecord = addMedicalRecord.bind(null, params.id);
  const addPrescriptionAction = addPrescription.bind(null, params.id);
  const addCertificateAction = addMedicalCertificate.bind(null, params.id);
  const addTherapyPlanAction = addTherapyPlan.bind(null, params.id);
  const addDocumentAction = addPatientDocument.bind(null, params.id);
  const age = calculateAge(patient.birth_date);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between rounded-xl bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-800">{patient.full_name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                patient.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {patient.is_active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {age !== null ? `${age} anos` : 'Idade não informada'} ·{' '}
            {patient.gender ?? 'Gênero não informado'} ·{' '}
            {patient.insurance_provider ?? 'Sem convênio'}
          </p>
        </div>
        <div className="flex gap-4">
          <PatientPortalLinkButton patientId={patient.id} />
          <Link
            href={`/dashboard/patients/${patient.id}/consents`}
            className="self-center text-sm text-brand-600 hover:underline"
          >
            Termos de consentimento
          </Link>
          <Link
            href={`/dashboard/patients/${patient.id}/edit`}
            className="self-center rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Editar
          </Link>
        </div>
      </div>

      <Tabs
        tabs={[
          {
            id: 'dados',
            label: 'Dados Cadastrais',
            content: (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-white p-5 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700">Dados Pessoais</h2>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="CPF" value={patient.cpf} />
                    <Field label="RG" value={patient.rg} />
                    <Field
                      label="Data de Nascimento"
                      value={
                        patient.birth_date
                          ? new Date(patient.birth_date).toLocaleDateString('pt-BR')
                          : null
                      }
                    />
                    <Field label="Estado Civil" value={patient.marital_status} />
                    <Field label="Profissão" value={patient.occupation} />
                  </dl>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700">Contato</h2>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Telefone" value={patient.phone} />
                    <Field label="E-mail" value={patient.email} />
                    <Field label="Contato de Emergência" value={patient.emergency_contact_name} />
                    <Field label="Telefone Emergência" value={patient.emergency_contact_phone} />
                  </dl>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700">Endereço</h2>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="CEP" value={patient.address_zip_code} />
                    <Field label="Logradouro" value={patient.address_street} />
                    <Field label="Número" value={patient.address_number} />
                    <Field label="Complemento" value={patient.address_complement} />
                    <Field label="Bairro" value={patient.address_neighborhood} />
                    <Field label="Cidade" value={patient.address_city} />
                    <Field label="Estado" value={patient.address_state} />
                  </dl>
                </div>

                <div className="rounded-xl bg-green-50 p-5 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold text-green-800">
                    Convênio e Autorização
                  </h2>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Convênio" value={patient.insurance_provider} />
                    <Field label="Número do Cartão" value={patient.insurance_id_number} />
                    <Field label="Número da Guia" value={patient.insurance_authorization_number} />
                    <Field
                      label="Sessões Autorizadas"
                      value={patient.insurance_sessions_authorized?.toString() ?? null}
                    />
                    <Field
                      label="Sessões Utilizadas"
                      value={patient.insurance_sessions_used?.toString() ?? null}
                    />
                  </dl>
                </div>
              </div>
            ),
          },
          {
            id: 'prontuario',
            label: 'Prontuário',
            content: (
              <Tabs
                tabs={[
                  {
                    id: 'planos',
                    label: 'Planos Terapêuticos',
                    content: (
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className="text-sm font-semibold text-gray-700">
                            Planos terapêuticos
                          </h2>
                          <ModalForm triggerLabel="+ Novo Plano Terapêutico" title="Novo Plano Terapêutico">
                            <form action={addTherapyPlanAction} className="flex flex-col gap-3">
                              <label className={labelClass}>
                                Área
                                <select name="area" className={`mt-1 w-full ${inputClass}`}>
                                  {THERAPY_AREAS.map((area) => (
                                    <option key={area} value={area}>
                                      {area}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <textarea
                                name="objetivos"
                                rows={3}
                                placeholder="Objetivos terapêuticos..."
                                className={inputClass}
                              />
                              <div className="flex gap-3">
                                <label className={`flex-1 ${labelClass}`}>
                                  Início
                                  <input
                                    name="start_date"
                                    type="date"
                                    className={`mt-1 w-full ${inputClass}`}
                                  />
                                </label>
                                <label className={`flex-1 ${labelClass}`}>
                                  Revisão
                                  <input
                                    name="review_date"
                                    type="date"
                                    className={`mt-1 w-full ${inputClass}`}
                                  />
                                </label>
                              </div>
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  type="submit"
                                  className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                                >
                                  Salvar
                                </button>
                              </div>
                            </form>
                          </ModalForm>
                        </div>
                        <div className="flex flex-col gap-3">
                          {(therapyPlans ?? []).map((plan) => (
                            <div key={plan.id} className="rounded-xl bg-white p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-gray-800">
                                  {plan.area ?? 'Plano terapêutico'}
                                </p>
                                <span className="shrink-0 rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                                  {plan.status}
                                </span>
                              </div>
                              {plan.objetivos && (
                                <p className="mt-1 text-sm text-gray-600">{plan.objetivos}</p>
                              )}
                              <p className="mt-2 text-xs text-gray-400">
                                {plan.start_date &&
                                  `Início: ${new Date(plan.start_date).toLocaleDateString('pt-BR')}`}
                                {plan.review_date &&
                                  ` · Revisão: ${new Date(plan.review_date).toLocaleDateString('pt-BR')}`}
                              </p>
                            </div>
                          ))}
                          {(therapyPlans ?? []).length === 0 && (
                            <p className="text-sm text-gray-400">
                              Nenhum plano terapêutico cadastrado ainda.
                            </p>
                          )}
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: 'notas',
                    label: 'Notas Clínicas',
                    content: (
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className="text-sm font-semibold text-gray-700">Histórico</h2>
                          <ModalForm triggerLabel="+ Nova Nota" title="Nova entrada no prontuário">
                            <MedicalRecordEntryForm action={addRecord} templates={templates ?? []} />
                          </ModalForm>
                        </div>
                        <div className="flex flex-col gap-3">
                          {(records ?? []).map((record) => (
                            <div key={record.id} className="rounded-xl bg-white p-4 shadow-sm">
                              <div
                                className="prose prose-sm max-w-none text-sm text-gray-800"
                                dangerouslySetInnerHTML={{ __html: record.entry }}
                              />
                              {record.attachments?.length > 0 && (
                                <div className="mt-2 flex flex-col gap-1">
                                  {record.attachments.map((path) => (
                                    <AttachmentLink key={path} path={path} />
                                  ))}
                                </div>
                              )}
                              <p className="mt-2 text-xs text-gray-400">
                                {record.profiles?.full_name} ·{' '}
                                {new Date(record.created_at).toLocaleString('pt-BR')}
                              </p>
                              {record.signed_at ? (
                                <div className="mt-2 flex items-center gap-2 rounded bg-green-50 px-2 py-1">
                                  {record.signature_data && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={record.signature_data} alt="assinatura" className="h-8" />
                                  )}
                                  <p className="text-[11px] text-green-700">
                                    Assinado digitalmente em{' '}
                                    {new Date(record.signed_at).toLocaleString('pt-BR')} · hash{' '}
                                    {record.content_hash?.slice(0, 12)}…
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
                    ),
                  },
                  {
                    id: 'receitas',
                    label: 'Receitas',
                    content: (
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className="text-sm font-semibold text-gray-700">Receitas</h2>
                          <ModalForm triggerLabel="+ Nova Receita" title="Nova receita">
                            <form action={addPrescriptionAction} className="flex flex-col gap-3">
                              <input
                                name="title"
                                required
                                placeholder="Título (ex: Receita de uso contínuo)"
                                className={inputClass}
                              />
                              <textarea
                                name="description"
                                rows={3}
                                placeholder="Detalhes da prescrição..."
                                className={inputClass}
                              />
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  type="submit"
                                  className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                                >
                                  Salvar
                                </button>
                              </div>
                            </form>
                          </ModalForm>
                        </div>
                        <div className="flex flex-col gap-3">
                          {(prescriptions ?? []).map((prescription) => (
                            <div key={prescription.id} className="rounded-xl bg-white p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-gray-800">
                                    {prescription.title}
                                  </p>
                                  {prescription.description && (
                                    <p className="mt-1 text-sm text-gray-600">
                                      {prescription.description}
                                    </p>
                                  )}
                                </div>
                                <span className="shrink-0 rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                                  {prescription.status}
                                </span>
                              </div>
                              {prescription.signed_at ? (
                                <p className="mt-2 text-[11px] text-green-700">
                                  Assinada digitalmente em{' '}
                                  {new Date(prescription.signed_at).toLocaleString('pt-BR')} · hash{' '}
                                  {prescription.content_hash?.slice(0, 12)}…
                                </p>
                              ) : (
                                <div className="mt-2 flex items-center gap-3">
                                  <form
                                    action={updatePrescriptionStatus.bind(
                                      null,
                                      params.id,
                                      prescription.id,
                                      'Finalizada',
                                    )}
                                  >
                                    {prescription.status !== 'Finalizada' && (
                                      <button
                                        type="submit"
                                        className="text-xs text-brand-600 hover:underline"
                                      >
                                        Marcar como finalizada
                                      </button>
                                    )}
                                  </form>
                                  {prescription.author_id === profile.id && (
                                    <SignPrescriptionButton
                                      patientId={patient.id}
                                      prescriptionId={prescription.id}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                          {(prescriptions ?? []).length === 0 && (
                            <p className="text-sm text-gray-400">Nenhuma receita cadastrada ainda.</p>
                          )}
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: 'atestados',
                    label: 'Atestados',
                    content: (
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className="text-sm font-semibold text-gray-700">Atestados</h2>
                          <ModalForm triggerLabel="+ Novo Atestado" title="Novo atestado">
                            <form action={addCertificateAction} className="flex flex-col gap-3">
                              <textarea
                                name="content"
                                required
                                rows={4}
                                placeholder="Texto do atestado..."
                                className={inputClass}
                              />
                              <label className={labelClass}>
                                Dias de afastamento (opcional)
                                <input
                                  name="days_off"
                                  type="number"
                                  min={0}
                                  className={`mt-1 w-full ${inputClass}`}
                                />
                              </label>
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  type="submit"
                                  className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                                >
                                  Salvar
                                </button>
                              </div>
                            </form>
                          </ModalForm>
                        </div>
                        <div className="flex flex-col gap-3">
                          {(certificates ?? []).map((certificate) => (
                            <div key={certificate.id} className="rounded-xl bg-white p-4 shadow-sm">
                              <p className="text-sm text-gray-800">{certificate.content}</p>
                              {certificate.days_off !== null && (
                                <p className="mt-1 text-xs text-gray-500">
                                  {certificate.days_off} dia(s) de afastamento
                                </p>
                              )}
                              <p className="mt-2 text-xs text-gray-400">
                                {new Date(certificate.created_at).toLocaleString('pt-BR')}
                              </p>
                              {certificate.signed_at ? (
                                <p className="mt-2 text-[11px] text-green-700">
                                  Assinado digitalmente em{' '}
                                  {new Date(certificate.signed_at).toLocaleString('pt-BR')} · hash{' '}
                                  {certificate.content_hash?.slice(0, 12)}…
                                </p>
                              ) : (
                                certificate.professional_id === profile.id && (
                                  <SignCertificateButton
                                    patientId={patient.id}
                                    certificateId={certificate.id}
                                  />
                                )
                              )}
                            </div>
                          ))}
                          {(certificates ?? []).length === 0 && (
                            <p className="text-sm text-gray-400">Nenhum atestado emitido ainda.</p>
                          )}
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: 'documentos',
                    label: 'Documentos',
                    content: (
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className="text-sm font-semibold text-gray-700">Documentos</h2>
                          <ModalForm triggerLabel="+ Novo Documento" title="Novo documento">
                            <form
                              action={addDocumentAction}
                              encType="multipart/form-data"
                              className="flex flex-col gap-3"
                            >
                              <input
                                name="title"
                                required
                                placeholder="Título do documento"
                                className={inputClass}
                              />
                              <textarea
                                name="description"
                                rows={2}
                                placeholder="Descrição (opcional)"
                                className={inputClass}
                              />
                              <label className={labelClass}>
                                Arquivo
                                <input name="file" type="file" className={`mt-1 w-full ${inputClass}`} />
                              </label>
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  type="submit"
                                  className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                                >
                                  Salvar
                                </button>
                              </div>
                            </form>
                          </ModalForm>
                        </div>
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
                                  <form
                                    action={toggleDocumentArchive.bind(null, params.id, document.id, true)}
                                  >
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
                              <summary className="cursor-pointer text-xs text-gray-400">
                                Documentos arquivados
                              </summary>
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
                                        <form
                                          action={toggleDocumentArchive.bind(
                                            null,
                                            params.id,
                                            document.id,
                                            false,
                                          )}
                                        >
                                          <button
                                            type="submit"
                                            className="text-xs text-brand-600 hover:underline"
                                          >
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
                    ),
                  },
                ]}
              />
            ),
          },
          {
            id: 'agendamentos',
            label: 'Agendamentos',
            content: (
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Profissional</th>
                      <th className="px-4 py-3">Sala</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(appointments ?? []).map((appointment) => (
                      <tr key={appointment.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 text-gray-700">
                          {new Date(appointment.scheduled_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{appointment.profiles?.full_name}</td>
                        <td className="px-4 py-3 text-gray-500">{appointment.rooms?.name ?? '-'}</td>
                        <td className="px-4 py-3 text-gray-500">{appointment.status}</td>
                      </tr>
                    ))}
                    {(appointments ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                          Nenhum agendamento registrado ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ),
          },
          {
            id: 'financeiro',
            label: 'Financeiro',
            content: (
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Valor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Vencimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoices ?? []).map((invoice) => (
                      <tr key={invoice.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 text-gray-700">
                          {new Date(invoice.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {formatCurrency(invoice.amount_cents)}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{invoice.status}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {invoice.due_date
                            ? new Date(invoice.due_date).toLocaleDateString('pt-BR')
                            : '-'}
                        </td>
                      </tr>
                    ))}
                    {(invoices ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                          Nenhuma fatura registrada ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-gray-800">{value ?? '-'}</dd>
    </div>
  );
}
