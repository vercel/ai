'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function createProduct(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();
  const priceReais = Number(formData.get('price') ?? 0);

  const { error } = await supabase.from('products').insert({
    clinic_id: profile.clinic_id,
    name: String(formData.get('name') ?? ''),
    price_cents: Math.round(priceReais * 100),
    stock: Number(formData.get('stock') ?? 0),
    description: String(formData.get('description') ?? '') || null,
  });

  if (error) {
    redirect(`/dashboard/store/products/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/store/products');
  redirect('/dashboard/store/products');
}

export async function deleteProduct(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from('products').delete().eq('id', id);
  revalidatePath('/dashboard/store/products');
}

export async function sellProduct(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const productId = String(formData.get('product_id') ?? '');
  const quantity = Math.max(1, Number(formData.get('quantity') ?? 1));
  const patientId = String(formData.get('patient_id') ?? '') || null;

  const { data: product } = await supabase
    .from('products')
    .select('price_cents, stock')
    .eq('id', productId)
    .single<{ price_cents: number; stock: number }>();

  if (!product || product.stock < quantity) {
    redirect(`/dashboard/store/products?error=${encodeURIComponent('Estoque insuficiente')}`);
  }

  const { error } = await supabase.from('sales').insert({
    clinic_id: profile.clinic_id,
    product_id: productId,
    patient_id: patientId,
    quantity,
    total_cents: product.price_cents * quantity,
    sold_by: profile.id,
  });

  if (error) {
    redirect(`/dashboard/store/products?error=${encodeURIComponent(error.message)}`);
  }

  await supabase
    .from('products')
    .update({ stock: product.stock - quantity })
    .eq('id', productId);

  revalidatePath('/dashboard/store/products');
  redirect('/dashboard/store/products');
}
