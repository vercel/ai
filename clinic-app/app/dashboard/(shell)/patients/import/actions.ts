'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { onlyDigits } from '@/lib/document';

export interface ImportedPatientRow {
  full_name: string;
  email?: string;
  cpf?: string;
  phone?: string;
  birth_date?: string;
  gender?: string;
}

export interface ImportPatientsResult {
  imported: number;
  skipped: number;
  error?: string;
}

const BATCH_SIZE = 500;

function normalizeBirthDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
  return isoMatch ? trimmed : null;
}

export async function importPatientsBulk(rows: ImportedPatientRow[]): Promise<ImportPatientsResult> {
  const profile = await requireProfile();

  if (!profile.clinic_id) {
    return { imported: 0, skipped: rows.length, error: 'Clínica não encontrada' };
  }

  const supabase = createSupabaseServerClient();

  const records = rows
    .map((row) => ({
      clinic_id: profile.clinic_id,
      created_by: profile.id,
      full_name: (row.full_name ?? '').trim(),
      email: row.email?.trim() || null,
      cpf: row.cpf ? onlyDigits(row.cpf) : null,
      phone: row.phone?.trim() || null,
      birth_date: normalizeBirthDate(row.birth_date),
      gender: row.gender?.trim() || null,
      is_active: true,
    }))
    .filter((record) => record.full_name.length > 0);

  const skipped = rows.length - records.length;

  if (records.length === 0) {
    return { imported: 0, skipped, error: 'Nenhum registro válido (nome é obrigatório)' };
  }

  // Upserting on (clinic_id, cpf) means a re-sent file (or a CPF repeated
  // across rows) refreshes the existing patient's contact data instead of
  // creating a duplicate row — their id, and everything linked to it
  // (appointments, medical records, invoices...), stays intact.
  let imported = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from('patients')
      .upsert(batch, { onConflict: 'clinic_id,cpf', ignoreDuplicates: false, count: 'exact' });
    if (error) {
      return { imported, skipped: rows.length - imported, error: error.message };
    }
    imported += count ?? batch.length;
  }

  revalidatePath('/dashboard/patients');
  return { imported, skipped };
}
