import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type {
  Appointment,
  AppointmentAttachment,
  MedicalRecord,
  MedicalRecordTemplate,
  Patient,
  Prescription,
  Profile,
} from '@/lib/types';
import { addMedicalRecord, addPrescription } from '../../patients/actions';
import { AttachmentLink } from '@/components/attachment-link';
import { AppointmentAttachmentUploader } from '@/components/appointment-attachment-uploader';
import { MedicalRecordEntryForm } from '@/components/medical-record-entry-form';
import { ModalForm } from '@/components/modal-form';
import { startAttendance } from './actions';

const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm';

export default async function AppointmentAttendancePage({
  params,
}: {
  params: { appointment_id: string };
}) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, patients(*)')
    .eq('id', params.appointment_id)
    .single<Appointment & { patients: Patient }>();

  if (!appointment || appointment.professional_id !== profile.id) {
    notFound();
  }

  const patient = appointment.patients;
  const inProgress = appointment.status === 'in_progress';

  const startAttendanceAction = startAttendance.bind(null, appointment.id);

  if (!inProgress) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
            Próximo atendimento
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-800">{patient.full_name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {new Date(appointment.scheduled_at).toLocaleString('pt-BR')}
          </p>
          <div className="mt-4 rounded-lg bg-gray-50 p-4 text-left text-sm text-gray-600">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
              Motivo da consulta
            </p>
            <p>{appointment.notes || 'Não informado'}</p>
          </div>

          <form action={startAttendanceAction} className="mt-6">
            <button
              type="submit"
              className="w-full rounded-lg bg-brand-600 px-6 py-4 text-base font-semibold text-white hover:bg-brand-700"
            >
              Iniciar Atendimento
            </button>
          </form>
        </div>
      </div>
    );
  }

  const [{ data: records }, { data: prescriptions }, { data: templates }, { data: attachments }] =
    await Promise.all([
      supabase
        .from('medical_records')
        .select('*, profiles(full_name)')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false })
        .returns<(MedicalRecord & { profiles: Pick<Profile, 'full_name'> })[]>(),
      supabase
        .from('prescriptions')
        .select('*')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false })
        .returns<Prescription[]>(),
      supabase
        .from('medical_record_templates')
        .select('*')
        .order('title')
        .returns<MedicalRecordTemplate[]>(),
      supabase
        .from('appointment_attachments')
        .select('*')
        .eq('appointment_id', appointment.id)
        .order('created_at', { ascending: false })
        .returns<AppointmentAttachment[]>(),
    ]);

  const addRecord = addMedicalRecord.bind(null, patient.id);
  const addPrescriptionAction = addPrescription.bind(null, patient.id);

  return (
    <div>
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-800">{patient.full_name}</h1>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Em atendimento
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {new Date(appointment.scheduled_at).toLocaleString('pt-BR')} · {appointment.notes || 'Sem motivo informado'}
        </p>
        <Link href={`/dashboard/patients/${patient.id}`} className="mt-2 inline-block text-sm text-brand-600 hover:underline">
          Ver ficha completa do paciente
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Prontuário</h2>
            <ModalForm triggerLabel="+ Nova Nota" title="Nova entrada no prontuário">
              <MedicalRecordEntryForm action={addRecord} templates={templates ?? []} />
            </ModalForm>
          </div>
          <div className="flex flex-col gap-3">
            {(records ?? []).map((record) => (
              <div key={record.id} className="rounded-lg bg-gray-50 p-3">
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
                  {record.profiles?.full_name} · {new Date(record.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            ))}
            {(records ?? []).length === 0 && (
              <p className="text-sm text-gray-400">Nenhuma entrada no prontuário ainda.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Prescrição</h2>
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
              <div key={prescription.id} className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm font-medium text-gray-800">{prescription.title}</p>
                {prescription.description && (
                  <p className="mt-1 text-sm text-gray-600">{prescription.description}</p>
                )}
                <span className="mt-2 inline-block rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                  {prescription.status}
                </span>
              </div>
            ))}
            {(prescriptions ?? []).length === 0 && (
              <p className="text-sm text-gray-400">Nenhuma receita cadastrada ainda.</p>
            )}
          </div>
        </div>

        <AppointmentAttachmentUploader
          appointmentId={appointment.id}
          patientId={patient.id}
          attachments={attachments ?? []}
        />

        <div className="rounded-xl bg-white p-5 shadow-sm md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Histórico Clínico</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-400">Diagnóstico</dt>
              <dd className="text-gray-800">{patient.diagnosis_summary ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Alergias</dt>
              <dd className="text-gray-800">{patient.allergies ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Condições Crônicas</dt>
              <dd className="text-gray-800">{patient.chronic_conditions ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Convênio</dt>
              <dd className="text-gray-800">{patient.insurance_provider ?? '-'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
