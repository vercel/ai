import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { MedicalRecord, Patient, Profile } from '@/lib/types';
import { addMedicalRecord } from '../actions';

export default async function PatientDetailPage({ params }: { params: { id: string } }) {
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
      <h1 className="text-2xl font-semibold text-gray-800">{patient.full_name}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {patient.phone ?? 'Sem telefone'} · {patient.email ?? 'Sem e-mail'}
      </p>

      <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Nova entrada no prontuário</h2>
        <form action={addRecord} className="flex flex-col gap-3">
          <textarea
            name="entry"
            required
            rows={4}
            placeholder="Anotações clínicas..."
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

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Histórico</h2>
      <div className="flex flex-col gap-3">
        {(records ?? []).map((record) => (
          <div key={record.id} className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-800">{record.entry}</p>
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
  );
}
