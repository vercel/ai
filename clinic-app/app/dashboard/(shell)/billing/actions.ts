'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function createInvoice(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const amountReais = Number(formData.get('amount') ?? 0);

  const { error } = await supabase.from('invoices').insert({
    clinic_id: profile.clinic_id,
    patient_id: String(formData.get('patient_id') ?? ''),
    amount_cents: Math.round(amountReais * 100),
    due_date: String(formData.get('due_date') ?? '') || null,
    payment_method_id: String(formData.get('payment_method_id') ?? '') || null,
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

export async function markInvoicePaidWithMethod(id: string, formData: FormData) {
  const supabase = createSupabaseServerClient();
  const paymentMethodId = String(formData.get('payment_method_id') ?? '') || null;

  let paymentMethodName: string | null = null;
  if (paymentMethodId) {
    const { data: method } = await supabase
      .from('payment_methods')
      .select('name')
      .eq('id', paymentMethodId)
      .single<{ name: string }>();
    paymentMethodName = method?.name ?? null;
  }

  await supabase
    .from('invoices')
    .update({
      status: 'pago',
      paid_at: new Date().toISOString(),
      payment_method_id: paymentMethodId,
      payment_method: paymentMethodName,
    })
    .eq('id', id);
  revalidatePath('/dashboard/billing');
}

export async function addInvoiceItem(invoiceId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const quantity = Number(formData.get('quantity') ?? 1) || 1;
  const unitPriceReais = Number(formData.get('unit_price') ?? 0) || 0;
  const unitPrice = Math.round(unitPriceReais * 100);

  await supabase.from('invoice_items').insert({
    clinic_id: profile.clinic_id,
    invoice_id: invoiceId,
    description: String(formData.get('description') ?? ''),
    quantity,
    unit_price: unitPrice,
    total_price: Math.round(unitPrice * quantity),
  });

  revalidatePath(`/dashboard/billing/${invoiceId}/edit`);
}

export async function deleteInvoiceItem(invoiceId: string, id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('invoice_items').delete().eq('id', id);
  revalidatePath(`/dashboard/billing/${invoiceId}/edit`);
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
      payment_method_id: String(formData.get('payment_method_id') ?? '') || null,
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
