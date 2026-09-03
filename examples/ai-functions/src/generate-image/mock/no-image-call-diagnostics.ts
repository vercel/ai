import { generateImage, NoImageGeneratedError } from 'ai';
import { MockImageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

run(async () => {
  try {
    await generateImage({
      model: new MockImageModelV4({
        doGenerate: async () => ({
          images: [],
          providerMetadata: {
            mock: {
              images: [],
              requestId: 'request-123',
            },
          },
          response: {
            timestamp: new Date('2026-09-03T00:00:00.000Z'),
            modelId: 'mock-image-model',
            headers: {
              'x-request-id': 'request-123',
            },
          },
          warnings: [
            {
              type: 'other',
              message: 'The provider completed without returning an image.',
            },
          ],
          usage: {
            inputTokens: 12,
            outputTokens: 0,
            totalTokens: 12,
          },
        }),
      }),
      prompt: 'A lighthouse during a storm',
    });
  } catch (error) {
    if (!NoImageGeneratedError.isInstance(error)) {
      throw error;
    }

    for (const call of error.calls ?? []) {
      console.log({
        modelId: call.response.modelId,
        warnings: call.warnings,
        usage: call.usage,
        providerMetadata: call.providerMetadata?.mock,
      });
    }
  }
});
