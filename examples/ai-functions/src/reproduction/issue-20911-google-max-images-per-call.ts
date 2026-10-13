import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateImage } from 'ai';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixture = JSON.parse(
  fs.readFileSync(
    '../../packages/google/src/__fixtures__/google-image-gemini-3.1-flash-image.json',
    'utf8',
  ),
);
const imageData =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ySAAAAAASUVORK5CYII=';

let observedAdvertisedLimit: unknown;
let observedCalls = 0;

function getObservedCalls() {
  return observedCalls;
}

async function generateTwoImages(maxImagesPerCall?: number) {
  observedCalls = 0;

  const google = createGoogleGenerativeAI({
    apiKey: 'fixture',
    fetch: async () => {
      observedCalls++;
      const response = structuredClone(fixture);
      response.candidates[0].content.parts[0].inlineData.data = imageData;
      return Response.json(response);
    },
  });
  const model = google.image('gemini-3.1-flash-image');
  observedAdvertisedLimit = model.maxImagesPerCall;

  return generateImage({
    model,
    prompt: 'Fixture.',
    n: 2,
    maxRetries: 0,
    ...(maxImagesPerCall == null ? {} : { maxImagesPerCall }),
  });
}

async function main() {
  const control = await generateTwoImages(1);
  assert.equal(
    getObservedCalls(),
    2,
    'explicit batching control must make two calls',
  );
  assert.equal(
    control.images.length,
    2,
    'explicit batching control must return two images',
  );

  const signal =
    'ISSUE_20911_REPRODUCED: default Google image batching failed to make two calls and return two images';

  try {
    const defaultResult = await generateTwoImages();
    assert.equal(getObservedCalls(), 2, signal);
    assert.equal(defaultResult.images.length, 2, signal);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !==
        'Gemini image models do not support generating a set number of images per call. Use n=1 or omit the n parameter.' ||
      observedAdvertisedLimit !== 10 ||
      getObservedCalls() !== 0
    ) {
      throw error;
    }

    throw new Error(signal, { cause: error });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
