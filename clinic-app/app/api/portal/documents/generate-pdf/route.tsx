import { renderToBuffer } from '@react-pdf/renderer';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DocumentPdf } from '@/lib/pdf/document-pdf';

// @react-pdf/renderer needs Node APIs (fs, buffers) it doesn't get on Edge.
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const documentId = request.nextUrl.searchParams.get('document_id');
  const documentType = request.nextUrl.searchParams.get('type');

  if (!token || !documentId || (documentType !== 'prescription' && documentType !== 'certificate')) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { data: allowed } = await supabase.rpc('verify_portal_document_access', {
    p_token: token,
    p_document_id: documentId,
    p_document_type: documentType,
  });

  if (!allowed) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { data } = await supabase.rpc('get_portal_pdf_document', {
    p_token: token,
    p_document_id: documentId,
    p_document_type: documentType,
  });

  if (!data) {
    return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    <DocumentPdf clinic={data.clinic} patient={data.patient} document={data.document} />,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${documentType}-${documentId}.pdf"`,
    },
  });
}
