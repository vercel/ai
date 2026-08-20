import { createXai } from '@ai-sdk/xai';
import assert from 'node:assert/strict';
import { generateImage, NoImageGeneratedError } from 'ai';

function createMockXai(responseBody: unknown) {
  return createXai({
    apiKey: 'test-api-key',
    baseURL: 'https://mock.x.ai/v1',
    fetch: async () =>
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });
}

async function main() {
  const emptyResponseXai = createMockXai({ data: [] });

  const providerResult = await emptyResponseXai
    .image('grok-imagine-image-2.0')
    .doGenerate({
      prompt: 'A prompt blocked by content moderation',
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      files: undefined,
      mask: undefined,
    });

  assert.deepEqual(providerResult.images, []);
  assert.deepEqual(providerResult.providerMetadata?.xai?.images, []);

  let emptyResponseError: unknown;
  try {
    await generateImage({
      model: emptyResponseXai.image('grok-imagine-image-2.0'),
      prompt: 'A prompt blocked by content moderation',
    });
  } catch (error) {
    emptyResponseError = error;
  }

  assert.ok(
    NoImageGeneratedError.isInstance(emptyResponseError),
    'generateImage should reject rather than resolve with images: []',
  );
  assert.equal(emptyResponseError.message, 'No image generated.');

  const partiallyBlockedXai = createMockXai({
    data: [
      {
        url: null,
        b64_json: null,
        respect_moderation: false,
      },
    ],
  });

  let partialResponseError: unknown;
  try {
    await generateImage({
      model: partiallyBlockedXai.image('grok-imagine-image-2.0'),
      prompt: 'A batch containing a moderated image',
    });
  } catch (error) {
    partialResponseError = error;
  }

  assert.ok(partialResponseError instanceof Error);
  assert.equal(partialResponseError.name, 'AI_DownloadError');
  assert.match(partialResponseError.message, /Invalid URL: null/);

  const moderationMetadataXai = createMockXai({
    data: [
      {
        b64_json: 'dGVzdA==',
        respect_moderation: false,
      },
    ],
  });

  const metadataResult = await generateImage({
    model: moderationMetadataXai.image('grok-imagine-image-2.0'),
    prompt: 'A response carrying moderation metadata',
  });

  assert.equal(metadataResult.images.length, 1);
  assert.deepEqual(metadataResult.providerMetadata.xai, {
    images: [{}],
  });

  console.log(
    JSON.stringify({
      primaryOutcome: {
        errorName: emptyResponseError.name,
        errorMessage: emptyResponseError.message,
      },
      providerEmptyResult: {
        images: providerResult.images,
        providerMetadata: providerResult.providerMetadata,
      },
      partialBatchOutcome: {
        errorName: partialResponseError.name,
        errorMessage: partialResponseError.message,
      },
      parsedModerationMetadata: metadataResult.providerMetadata.xai,
    }),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
