import { strict as assert } from 'node:assert';
import { createXai } from '@ai-sdk/xai';
import { generateImage, NoImageGeneratedError } from 'ai';

type ImageResponse = {
  data: Array<{
    url?: string | null;
    b64_json?: string | null;
    respect_moderation?: boolean;
  }>;
};

function createMockModel(responseBody: ImageResponse) {
  const provider = createXai({
    apiKey: 'test-api-key',
    baseURL: 'https://api.example.test/v1',
    fetch: async input => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (url === 'https://api.example.test/v1/images/generations') {
        return new Response(JSON.stringify(responseBody), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }

      if (url === 'https://images.example.test/generated.png') {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'content-type': 'image/png' },
          status: 200,
        });
      }

      throw new Error(`Unexpected request URL: ${url}`);
    },
  });

  return provider.image('grok-imagine-image-2.0');
}

async function captureError(action: () => PromiseLike<unknown>) {
  try {
    await action();
  } catch (error) {
    return error;
  }

  assert.fail('Expected the operation to reject.');
}

async function main() {
  const publicError = await captureError(() =>
    generateImage({
      model: createMockModel({ data: [] }),
      prompt: 'A prompt blocked by moderation',
    }),
  );

  assert.ok(
    NoImageGeneratedError.isInstance(publicError),
    `Expected AI_NoImageGeneratedError, received ${String(publicError)}`,
  );
  assert.equal(publicError.message, 'No image generated.');

  const directEmptyResult = await createMockModel({ data: [] }).doGenerate({
    prompt: 'A prompt blocked by moderation',
    n: 1,
    size: undefined,
    aspectRatio: undefined,
    seed: undefined,
    providerOptions: {},
    files: undefined,
    mask: undefined,
  });

  assert.deepEqual(directEmptyResult.images, []);
  assert.deepEqual(directEmptyResult.providerMetadata, {
    xai: { images: [] },
  });

  const partialModerationError = await captureError(() =>
    createMockModel({
      data: [
        {
          url: 'https://images.example.test/generated.png',
          b64_json: null,
          respect_moderation: true,
        },
        { url: null, b64_json: null, respect_moderation: false },
      ],
    }).doGenerate({
      prompt: 'Generate two images',
      n: 2,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      files: undefined,
      mask: undefined,
    }),
  );

  assert.ok(partialModerationError instanceof Error);
  assert.equal(partialModerationError.name, 'AI_DownloadError');
  assert.match(partialModerationError.message, /Invalid URL: null/);

  const ignoredModerationResult = await createMockModel({
    data: [{ b64_json: 'dGVzdA==', respect_moderation: false }],
  }).doGenerate({
    prompt: 'A prompt blocked by moderation',
    n: 1,
    size: undefined,
    aspectRatio: undefined,
    seed: undefined,
    providerOptions: {},
    files: undefined,
    mask: undefined,
  });

  assert.deepEqual(ignoredModerationResult.images, ['dGVzdA==']);
  assert.deepEqual(ignoredModerationResult.providerMetadata, {
    xai: { images: [{}] },
  });

  console.log(
    [
      'Issue #19168 could not be reproduced through public generateImage:',
      'data: [] rejected with AI_NoImageGeneratedError: No image generated.',
      'Secondary xAI image-model moderation gaps were observed.',
    ].join('\n'),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
