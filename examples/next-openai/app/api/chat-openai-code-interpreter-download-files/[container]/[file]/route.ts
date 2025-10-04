import 'dotenv/config';

const dynamic = 'force-dynamic';

const execute = async (
  _req: Request,
  {
    params,
  }: {
    params: Promise<{
      container: string;
      file: string;
    }>;
  },
) => {
  const { container, file } = await params;

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const infoUrl = `https://api.openai.com/v1/containers/${container}/files/${file}`;
  const infoResponse = await fetch(infoUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!infoResponse.ok) {
    throw new Error(
      `HTTP Error: ${infoResponse.status} ${infoResponse.statusText}`,
    );
  }
  const {
    path,
  }: {
    id: string;
    object: string;
    created_at: number;
    bytes: number;
    container_id: string;
    path: string;
    source: string;
  } = await infoResponse.json();

  const filename = path.split('/').at(-1) || 'result-file';

  const downloadUrl = `https://api.openai.com/v1/containers/${container}/files/${file}/content`;
  const downloadResponse = await fetch(downloadUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!downloadResponse.ok) {
    throw new Error(
      `HTTP Error: ${downloadResponse.status} ${downloadResponse.statusText}`,
    );
  }

  // get as binary data
  const arrayBuffer = await downloadResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Disposition': `attachment; filename=${filename}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.length.toString(),
      'X-File-Name': filename,
    },
  });
};

export { dynamic, execute as GET, execute as POST };
