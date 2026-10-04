export const dynamic = 'force-dynamic';

/**
 * Security Notice:
 * This route is an example demonstrating file retrieval from the Anthropic Files API for code execution outputs.
 * In a production deployment, ensure this route is protected by an appropriate authentication and authorization layer
 * to prevent unauthorized access to your account's files.
 */
const FILE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

const execute = async (
  _req: Request,
  {
    params,
  }: {
    params: Promise<{
      file: string;
    }>;
  },
) => {
  const { file } = await params;

  if (!file || !FILE_ID_REGEX.test(file)) {
    return new Response('Invalid file ID', { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY is not set', { status: 500 });
  }

  try {
    const infoUrl = `https://api.anthropic.com/v1/files/${file}`;
    const infoPromise = fetch(infoUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'files-api-2025-04-14',
      },
    });

    const downloadUrl = `https://api.anthropic.com/v1/files/${file}/content`;
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
      return new Response(
        `Failed to fetch file metadata: ${infoResponse.statusText}`,
        { status: infoResponse.status },
      );
    }

    if (!downloadResponse.ok) {
      return new Response(
        `Failed to download file content: ${downloadResponse.statusText}`,
        { status: downloadResponse.status },
      );
    }

    // https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/beta/files.ts
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
  } catch (error) {
    console.error('Error downloading code execution file:', error);
    return new Response('Error downloading file', { status: 500 });
  }
};

export { execute as GET, execute as POST };
