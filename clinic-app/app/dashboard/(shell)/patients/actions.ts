'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function generatePatientPortalLink(patientId: string) {
  await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: token, error } = await supabase.rpc('create_patient_portal_token', {
    p_patient_id: patientId,
    p_days: 30,
  });

  if (error || !token) {
    return null;
  }

  return `/p/${token}`;
}

function requestIp() {
  const forwardedFor = headers().get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || null;
}

function patientFieldsFromForm(formData: FormData) {
  const field = (name: string) => String(formData.get(name) ?? '') || null;

  return {
    full_name: String(formData.get('full_name') ?? ''),
    cpf: field('cpf'),
    rg: field('rg'),
    gender: field('gender'),
    birth_date: field('birth_date'),
    phone: field('phone'),
    email: field('email'),
    address_street: field('address_street'),
    address_number: field('address_number'),
    address_complement: field('address_complement'),
    address_neighborhood: field('address_neighborhood'),
    address_city: field('address_city'),
    address_state: field('address_state'),
    address_zip_code: field('address_zip_code'),
    marital_status: field('marital_status'),
    occupation: field('occupation'),
    emergency_contact_name: field('emergency_contact_name'),
    emergency_contact_phone: field('emergency_contact_phone'),
    insurance_provider: field('insurance_provider'),
    insurance_id_number: field('insurance_id_number'),
    insurance_authorization_number: field('insurance_authorization_number'),
    insurance_sessions_authorized: formData.get('insurance_sessions_authorized')
      ? Number(formData.get('insurance_sessions_authorized'))
      : null,
    responsavel_nome: field('responsavel_nome'),
    responsavel_cpf: field('responsavel_cpf'),
    responsavel_parentesco: field('responsavel_parentesco'),
    responsavel_telefone: field('responsavel_telefone'),
    responsavel_email: field('responsavel_email'),
    diagnosis_summary: field('diagnosis_summary'),
    diagnosis_date: field('diagnosis_date'),
    allergies: field('allergies'),
    chronic_conditions: field('chronic_conditions'),
    is_active: formData.get('is_active') !== 'off',
    notes: field('notes'),
  };
}

export async function createPatient(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from('patients').insert({
    ...patientFieldsFromForm(formData),
    created_by: profile.id,
    clinic_id: profile.clinic_id,
  });

  if (error) {
    redirect(`/dashboard/patients/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/patients');
  redirect('/dashboard/patients');
}

export async function updatePatient(id: string, formData: FormData) {
  await requireProfile();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from('patients')
    .update(patientFieldsFromForm(formData))
    .eq('id', id);

  if (error) {
    redirect(`/dashboard/patients/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/patients');
  revalidatePath(`/dashboard/patients/${id}`);
  redirect('/dashboard/patients');
}

export async function deletePatient(id: string) {
  await requireProfile();
  const supabase = createSupabaseServerClient();
  await supabase.from('patients').delete().eq('id', id);
  revalidatePath('/dashboard/patients');
}

export async function addMedicalRecord(patientId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const attachments: string[] = [];
  const file = formData.get('attachment') as File | null;
  if (file && file.size > 0) {
    const path = `${patientId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file);
    if (!uploadError) {
      attachments.push(path);
    }
  }

  await supabase.from('medical_records').insert({
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    professional_id: profile.id,
    entry: String(formData.get('entry') ?? ''),
    attachments,
  });

  revalidatePath(`/dashboard/patients/${patientId}`);
}

export async function getAttachmentUrl(path: string) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.storage.from('attachments').createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}

export async function addPrescription(patientId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  await supabase.from('prescriptions').insert({
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    author_id: profile.id,
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? '') || null,
    status: 'Rascunho',
  });

  revalidatePath(`/dashboard/patients/${patientId}`);
}

export async function updatePrescriptionStatus(patientId: string, id: string, status: string) {
  await requireProfile();
  const supabase = createSupabaseServerClient();
  await supabase.from('prescriptions').update({ status }).eq('id', id);
  revalidatePath(`/dashboard/patients/${patientId}`);
}

export async function signPrescription(
  patientId: string,
  prescriptionId: string,
  signatureData: string,
) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: prescription } = await supabase
    .from('prescriptions')
    .select('title, description, author_id, signed_at')
    .eq('id', prescriptionId)
    .single<{ title: string; description: string | null; author_id: string; signed_at: string | null }>();

  if (!prescription || prescription.signed_at || prescription.author_id !== profile.id) {
    return;
  }

  const signedAt = new Date().toISOString();
  const contentHash = createHash('sha256')
    .update(`${prescription.title}|${prescription.description ?? ''}|${profile.id}|${signedAt}`)
    .digest('hex');

  await supabase
    .from('prescriptions')
    .update({
      signed_at: signedAt,
      signature_data: signatureData,
      content_hash: contentHash,
      signer_ip: requestIp(),
      status: 'Finalizada',
    })
    .eq('id', prescriptionId);

  revalidatePath(`/dashboard/patients/${patientId}`);
}

export async function addMedicalCertificate(patientId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const daysOff = formData.get('days_off') ? Number(formData.get('days_off')) : null;

  await supabase.from('medical_certificates').insert({
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    professional_id: profile.id,
    content: String(formData.get('content') ?? ''),
    days_off: daysOff,
  });

  revalidatePath(`/dashboard/patients/${patientId}`);
}

export async function signMedicalCertificate(
  patientId: string,
  certificateId: string,
  signatureData: string,
) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: certificate } = await supabase
    .from('medical_certificates')
    .select('content, professional_id, signed_at')
    .eq('id', certificateId)
    .single<{ content: string; professional_id: string; signed_at: string | null }>();

  if (!certificate || certificate.signed_at || certificate.professional_id !== profile.id) {
    return;
  }

  const signedAt = new Date().toISOString();
  const contentHash = createHash('sha256')
    .update(`${certificate.content}|${profile.id}|${signedAt}`)
    .digest('hex');

  await supabase
    .from('medical_certificates')
    .update({
      signed_at: signedAt,
      signature_data: signatureData,
      content_hash: contentHash,
      signer_ip: requestIp(),
    })
    .eq('id', certificateId);

  revalidatePath(`/dashboard/patients/${patientId}`);
}

export async function addTherapyPlan(patientId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  await supabase.from('therapy_plans').insert({
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    professional_id: profile.id,
    area: String(formData.get('area') ?? '') || null,
    objetivos: String(formData.get('objetivos') ?? '') || null,
    start_date: String(formData.get('start_date') ?? '') || null,
    review_date: String(formData.get('review_date') ?? '') || null,
    status: 'Ativo',
  });

  revalidatePath(`/dashboard/patients/${patientId}`);
}

export async function addPatientDocument(patientId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  let fileUrl: string | null = null;
  let fileType: string | null = null;
  const file = formData.get('file') as File | null;
  if (file && file.size > 0) {
    const path = `${patientId}/docs/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file);
    if (!uploadError) {
      fileUrl = path;
      fileType = file.type;
    }
  }

  await supabase.from('patient_documents').insert({
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? '') || null,
    file_url: fileUrl,
    file_type: fileType,
  });

  revalidatePath(`/dashboard/patients/${patientId}`);
}

export async function toggleDocumentArchive(patientId: string, id: string, archived: boolean) {
  await requireProfile();
  const supabase = createSupabaseServerClient();
  await supabase.from('patient_documents').update({ is_archived: archived }).eq('id', id);
  revalidatePath(`/dashboard/patients/${patientId}`);
}

export async function signMedicalRecord(
  patientId: string,
  recordId: string,
  signatureData: string,
) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: record } = await supabase
    .from('medical_records')
    .select('entry, professional_id, signed_at')
    .eq('id', recordId)
    .single<{ entry: string; professional_id: string; signed_at: string | null }>();

  if (!record || record.signed_at || record.professional_id !== profile.id) {
    return;
  }

  const signedAt = new Date().toISOString();
  const contentHash = createHash('sha256')
    .update(`${record.entry}|${profile.id}|${signedAt}`)
    .digest('hex');

  await supabase
    .from('medical_records')
    .update({
      signed_at: signedAt,
      signature_data: signatureData,
      content_hash: contentHash,
      signer_ip: requestIp(),
    })
    .eq('id', recordId);

  revalidatePath(`/dashboard/patients/${patientId}`);
}
