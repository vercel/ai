import assert from 'node:assert/strict';
import { generateImage, ImageGenerationError } from 'ai';
import { MockImageModelV4 } from 'ai/test';

let callCount = 0;

const model = new MockImageModelV4({
  maxImagesPerCall: 1,
  doGenerate: async () => {
    const call = callCount++;

    if (call === 1) {
      throw new Error('second image request failed');
    }

    return {
      images: [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      warnings: [],
      response: {
        timestamp: new Date(0),
        modelId: 'mock-image-model',
        headers: { 'x-request-id': 'successful-call' },
      },
      usage: {
        inputTokens: 10,
        outputTokens: 1,
        totalTokens: 11,
      },
    };
  },
});

try {
  await generateImage({
    model,
    prompt: 'A synthetic example image',
    n: 2,
    maxRetries: 0,
  });
  throw new Error('Expected split image generation to fail');
} catch (error) {
  if (!ImageGenerationError.isInstance(error)) {
    throw error;
  }

  assert.equal(error.images.length, 1);
  assert.equal(error.calls.length, 1);
  assert.equal(error.failedCalls.length, 1);

  console.log({
    completedImages: error.images.length,
    successfulRequestId: error.calls[0].response.headers?.['x-request-id'],
    successfulUsage: error.calls[0].usage,
    failedCallIndex: error.failedCalls[0].callIndex,
  });
}
