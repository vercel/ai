import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfile } from '@/lib/auth';
import type { MedicalRecordTemplate } from '@/lib/types';
import { DeleteTemplateButton } from '@/components/delete-template-button';
import { RichTextEditor } from '@/components/rich-text-editor';
import { createTemplate } from './actions';

const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm';

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  const { data: templates } = await supabase
    .from('medical_record_templates')
    .select('*')
    .order('created_at', { ascending: false })
    .returns<MedicalRecordTemplate[]>();

  return (
    <div className="max-w-3xl">
      <div className="mb-2 text-xs text-gray-400">
        <Link href="/dashboard/admin" className="hover:underline">Administração</Link> / Modelos de prontuário
      </div>
      <h1 className="mb-1 text-2xl font-semibold text-brand-700">Modelos de prontuário</h1>
      <p className="mb-6 text-sm text-gray-500">
        Textos padrão disponíveis para toda a equipe ao registrar uma evolução no prontuário.
      </p>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{searchParams.error}</p>
      )}

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Novo modelo</h2>
        <form action={createTemplate} className="flex flex-col gap-3">
          <input name="title" required placeholder="Título (ex: Evolução Padrão)" className={inputClass} />
          <RichTextEditor name="content" />
          <button
            type="submit"
            className="self-start rounded bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Salvar modelo
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        {(templates ?? []).map((template) => (
          <div key={template.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-gray-800">{template.title}</p>
              <DeleteTemplateButton templateId={template.id} />
            </div>
            <div
              className="prose prose-sm mt-1 max-w-none text-gray-600"
              dangerouslySetInnerHTML={{ __html: template.content }}
            />
          </div>
        ))}
        {(templates ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhum modelo cadastrado ainda.</p>
        )}
      </div>
    </div>
  );
}
