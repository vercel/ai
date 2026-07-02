'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface PublicProfessional {
  id: string;
  full_name: string;
  specialty: string | null;
}

export async function listProfessionals(clinicSlug: string, specialty: string) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.rpc('get_public_professionals', {
    p_slug: clinicSlug,
    p_specialty: specialty,
  });
  return (data ?? []) as PublicProfessional[];
}

export async function listFreeSlots(clinicSlug: string, professionalId: string, date: string) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.rpc('get_public_free_slots', {
    p_slug: clinicSlug,
    p_professional_id: professionalId,
    p_date: date,
  });
  return (data ?? []) as string[];
}

export interface BookingFormState {
  error?: string;
  success?: boolean;
}

export async function submitBooking(
  clinicSlug: string,
  professionalId: string,
  scheduledAt: string,
  formData: FormData,
): Promise<BookingFormState> {
  const supabase = createSupabaseServerClient();

  const fullName = String(formData.get('full_name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const cpf = String(formData.get('cpf') ?? '').replace(/\D/g, '');

  if (!fullName || !phone || cpf.length !== 11) {
    return { error: 'Preencha nome, telefone e um CPF válido' };
  }

  const { error } = await supabase.rpc('create_public_appointment', {
    p_slug: clinicSlug,
    p_professional_id: professionalId,
    p_scheduled_at: scheduledAt,
    p_patient_name: fullName,
    p_patient_phone: phone,
    p_patient_cpf: cpf,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
