'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export interface FinancialMetrics {
  total_revenue_cents: number;
  average_ticket_cents: number;
  default_rate: number;
  consultations_count: number;
  appointments_count: number;
  no_show_rate: number;
}

export interface ProfessionalPerformance {
  professional_id: string;
  professional_name: string;
  revenue_cents: number;
  appointments_count: number;
}

export interface ChurnRiskPatient {
  patient_id: string;
  full_name: string;
  phone: string | null;
  last_appointment_at: string;
}

const EMPTY_METRICS: FinancialMetrics = {
  total_revenue_cents: 0,
  average_ticket_cents: 0,
  default_rate: 0,
  consultations_count: 0,
  appointments_count: 0,
  no_show_rate: 0,
};

// The clinic_id always comes from the authenticated session — never from
// the caller — and the RPCs re-check it against current_clinic_id() on the
// database side.
export async function getFinancialMetrics(
  startDate: string,
  endDate: string,
): Promise<FinancialMetrics> {
  const profile = await requireProfile();
  if (!profile.clinic_id) return EMPTY_METRICS;

  const supabase = createSupabaseServerClient();
  const { data } = await supabase.rpc('get_clinic_financial_metrics', {
    p_clinic_id: profile.clinic_id,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  return (data ?? EMPTY_METRICS) as FinancialMetrics;
}

export async function getProfessionalPerformance(
  startDate: string,
  endDate: string,
): Promise<ProfessionalPerformance[]> {
  const profile = await requireProfile();
  if (!profile.clinic_id) return [];

  const supabase = createSupabaseServerClient();
  const { data } = await supabase.rpc('get_professional_performance', {
    p_clinic_id: profile.clinic_id,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  return (data ?? []) as ProfessionalPerformance[];
}

export async function getChurnRiskPatients(): Promise<ChurnRiskPatient[]> {
  const profile = await requireProfile();
  if (!profile.clinic_id) return [];

  const supabase = createSupabaseServerClient();
  const { data } = await supabase.rpc('get_churn_risk_patients', {
    p_clinic_id: profile.clinic_id,
  });

  return (data ?? []) as ChurnRiskPatient[];
}
