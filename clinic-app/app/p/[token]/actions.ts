'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getPortalAttachmentUrl(token: string, path: string) {
  const supabase = createSupabaseServerClient();

  const { data: allowed } = await supabase.rpc('verify_portal_document_access', {
    p_token: token,
    p_path: path,
  });

  if (!allowed) {
    return null;
  }

  const { data } = await supabase.storage.from('attachments').createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}
