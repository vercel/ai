import { isLocalDevelopmentRequest } from '../../is-local-development-request';

const dynamic = 'force-dynamic';

const execute = async (
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      file: string;
    }>;
  },
) => {
  if (!isLocalDevelopmentRequest(req)) {
    return new Response('File downloads are only available in local development.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const { file } = await params;

  const resourceName = process.env.ANTHROPIC_MICROSOFT_RESOURCE_NAME;
  const apiKey = process.env.ANTHROPIC_MICROSOFT_API_KEY;
  if (!resourceName || !apiKey) {
    throw new Error('undeinfed resource or key.');
  }

  const infoUrl = `https://${resourceName}.services.ai.azure.com/anthropic/v1/files/${file}`;
  const infoPromise = fetch(infoUrl, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
    },
  });

  const downloadUrl = `https://${resourceName}.services.ai.azure.com/anthropic/v1/files/${file}/content`;
  const downloadPromise = fetch(downloadUrl, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
    },
  });

  const [infoResponse, downloadResponse] = await Promise.all([
    infoPromise,
    downloadPromise,
  ]);

  if (!infoResponse.ok) {
    throw new Error(
      `HTTP Error: ${infoResponse.status} ${infoResponse.statusText}`,
    );
  }

  if (!downloadResponse.ok) {
    throw new Error(
      `HTTP Error: ${downloadResponse.status} ${downloadResponse.statusText}`,
    );
  }

  const {
    filename,
    size_bytes,
  }: {
    type: 'file';
    id: string;
    size_bytes: number;
    created_at: Date;
    filename: string;
    mime_type: string;
    downloadable?: boolean;
  } = await infoResponse.json();

  // get as binary data
  const arrayBuffer = await downloadResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': size_bytes.toString(),
      'X-File-Name': encodeURIComponent(filename),
    },
  });
};

export { dynamic, execute as GET, execute as POST };
