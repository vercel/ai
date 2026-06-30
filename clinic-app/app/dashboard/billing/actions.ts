'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function createInvoice(formData: FormData) {
  const supabase = createSupabaseServerClient();

  const amountReais = Number(formData.get('amount') ?? 0);

  const { error } = await supabase.from('invoices').insert({
    patient_id: String(formData.get('patient_id') ?? ''),
    amount_cents: Math.round(amountReais * 100),
    due_date: String(formData.get('due_date') ?? '') || null,
  });

  if (error) {
    redirect(`/dashboard/billing/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/billing');
  redirect('/dashboard/billing');
}

export async function markInvoicePaid(id: string, paymentMethod?: string) {
  const supabase = createSupabaseServerClient();
  await supabase
    .from('invoices')
    .update({
      status: 'pago',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod ?? null,
    })
    .eq('id', id);
  revalidatePath('/dashboard/billing');
}

export async function updateInvoice(id: string, formData: FormData) {
  const supabase = createSupabaseServerClient();
  const amountReais = Number(formData.get('amount') ?? 0);

  const { error } = await supabase
    .from('invoices')
    .update({
      patient_id: String(formData.get('patient_id') ?? ''),
      amount_cents: Math.round(amountReais * 100),
      due_date: String(formData.get('due_date') ?? '') || null,
      status: String(formData.get('status') ?? 'pendente'),
    })
    .eq('id', id);

  if (error) {
    redirect(`/dashboard/billing/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/billing');
  redirect('/dashboard/billing');
}

export async function deleteInvoice(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('invoices').delete().eq('id', id);
  revalidatePath('/dashboard/billing');
}
