import { createDeepSeek } from '@ai-sdk/deepseek';
import { readFile } from 'node:fs/promises';
import { uploadFile } from 'ai';

type DeepSeekFileResponse = {
  id: string;
  object: string;
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
};

async function main() {
  const fixtureUrl = new URL(
    '../../../../packages/deepseek/src/files/__fixtures__/deepseek-file-upload.json',
    import.meta.url,
  );
  const response = JSON.parse(
    await readFile(fixtureUrl, 'utf8'),
  ) as DeepSeekFileResponse;

  const deepseek = createDeepSeek({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  const result = await uploadFile({
    api: deepseek,
    data: Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    ),
    mediaType: 'image/png',
    filename: response.filename,
  });

  console.log(JSON.stringify({ providerResponse: response, result }, null, 2));

  const metadata = result.providerMetadata?.deepseek;

  if (
    result.providerReference.deepseek !== response.id ||
    result.filename !== response.filename ||
    result.mediaType !== 'image/png' ||
    metadata?.filename !== response.filename ||
    metadata?.purpose !== response.purpose ||
    metadata?.bytes !== response.bytes ||
    metadata?.createdAt !== response.created_at
  ) {
    throw new Error(
      'Setup failure: existing DeepSeek upload result fields were not preserved.',
    );
  }

  if (metadata.object !== response.object) {
    throw new Error(
      'Reproduced issue #19390: DeepSeek upload result discarded response object discriminator "file".',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
