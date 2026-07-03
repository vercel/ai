'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { CashAdvanceStatus } from '@/lib/types';

export async function createCashAdvance(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();
  const amountReais = Number(formData.get('amount') ?? 0);

  const { error } = await supabase.from('cash_advances').insert({
    clinic_id: profile.clinic_id,
    amount_cents: Math.round(amountReais * 100),
    notes: String(formData.get('notes') ?? '') || null,
    requested_by: profile.id,
  });

  if (error) {
    redirect(`/dashboard/cash-advances/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/cash-advances');
  redirect('/dashboard/cash-advances');
}

export async function updateCashAdvanceStatus(id: string, status: CashAdvanceStatus) {
  const supabase = createSupabaseServerClient();
  await supabase.from('cash_advances').update({ status }).eq('id', id);
  revalidatePath('/dashboard/cash-advances');
}

export async function deleteCashAdvance(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('cash_advances').delete().eq('id', id);
  revalidatePath('/dashboard/cash-advances');
}
