export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const containerId = searchParams.get('container_id');
  const fileId = searchParams.get('file_id');
  const rawFilename = searchParams.get('filename') || 'file';

  // Validate container and file identifiers to avoid unsafe characters in the request path
  const idPattern = /^[A-Za-z0-9_-]+$/;
  if (!containerId || !fileId || !idPattern.test(containerId) || !idPattern.test(fileId)) {
    return new Response('Invalid container_id or file_id', { status: 400 });
  }

  // Sanitize filename used in Content-Disposition header
  const safeFilenamePattern = /^[A-Za-z0-9._ -]+$/;
  const filename =
    rawFilename.length > 0 && rawFilename.length <= 255 && safeFilenamePattern.test(rawFilename)
      ? rawFilename
      : 'file';

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response('OPENAI_API_KEY not configured', { status: 500 });
  }

  try {
    const response = await fetch(
      `https://api.openai.com/v1/containers/${containerId}/files/${fileId}/content`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!response.ok) {
      return new Response(`Failed to fetch file: ${response.statusText}`, {
        status: response.status,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';

    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return new Response('Error downloading file', { status: 500 });
  }
}
