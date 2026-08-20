import { createXai } from '@ai-sdk/xai';
import { generateImage, NoImageGeneratedError } from 'ai';
import assert from 'node:assert/strict';

function createMockXai(responseBody: unknown) {
  return createXai({
    apiKey: 'test-api-key',
    fetch: async (input, init) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return fetch(input, init);
    },
  });
}

const directCallOptions = {
  prompt: 'A prompt blocked by xAI moderation',
  n: 1,
  size: undefined,
  aspectRatio: undefined,
  seed: undefined,
  providerOptions: {},
  files: undefined,
  mask: undefined,
};

async function main() {
  const emptyResponseProvider = createMockXai({ data: [] });
  const emptyResponseModel = emptyResponseProvider.image(
    'grok-imagine-image-2.0',
  );

  let publicApiError: unknown;
  try {
    await generateImage({
      model: emptyResponseModel,
      prompt: 'A prompt blocked by xAI moderation',
      maxRetries: 0,
    });
  } catch (error) {
    publicApiError = error;
  }

  assert.ok(
    NoImageGeneratedError.isInstance(publicApiError),
    'Issue #19168 reproduced: generateImage resolved successfully with images: [] instead of rejecting.',
  );

  const directEmptyResult =
    await emptyResponseModel.doGenerate(directCallOptions);

  const partialResponseModel = createMockXai({
    data: [
      {
        url: null,
        b64_json: null,
        respect_moderation: false,
      },
    ],
  }).image('grok-imagine-image-2.0');

  let partialResponseError: unknown;
  try {
    await partialResponseModel.doGenerate({
      ...directCallOptions,
      prompt: 'A batch with one moderated image',
    });
  } catch (error) {
    partialResponseError = error;
  }

  assert.ok(
    partialResponseError instanceof TypeError,
    'Expected a moderated null image item to surface as a URL TypeError.',
  );
  assert.match(
    partialResponseError.message,
    /Failed to parse URL from null/,
    'Expected the misleading null URL validation error.',
  );

  const moderationMetadataResult = await createMockXai({
    data: [
      {
        b64_json: 'dGVzdA==',
        respect_moderation: false,
      },
    ],
  })
    .image('grok-imagine-image-2.0')
    .doGenerate({
      ...directCallOptions,
      prompt: 'A response carrying moderation metadata',
    });

  const output = {
    publicGenerateImage: {
      errorName:
        publicApiError instanceof Error ? publicApiError.name : undefined,
      errorMessage:
        publicApiError instanceof Error ? publicApiError.message : undefined,
    },
    directModelEmptyResponse: {
      imageCount: directEmptyResult.images.length,
      providerMetadata: directEmptyResult.providerMetadata,
    },
    partialModerationResponse: {
      errorName:
        partialResponseError instanceof Error
          ? partialResponseError.name
          : undefined,
      errorMessage:
        partialResponseError instanceof Error
          ? partialResponseError.message
          : undefined,
    },
    parsedModerationMetadata:
      moderationMetadataResult.providerMetadata?.xai?.images,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
