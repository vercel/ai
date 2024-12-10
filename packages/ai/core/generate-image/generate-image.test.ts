import { ImageModelV1 } from '@ai-sdk/provider';
import { MockImageModelV1 } from '../test/mock-image-model-v1';
import { generateImage } from './generate-image';

const prompt = 'sunny day at the beach';

describe('generateImage', () => {
  it('should send args to doGenerate', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let capturedArgs!: Parameters<ImageModelV1['doGenerate']>[0];

    await generateImage({
      model: new MockImageModelV1({
        doGenerate: async args => {
          capturedArgs = args;
          return { images: [] };
        },
      }),
      prompt,
      size: '1024x1024',
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      n: 1,
      prompt,
      size: '1024x1024',
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });
  });

  it('should return generated images', async () => {
    const result = await generateImage({
      model: new MockImageModelV1({
        doGenerate: async () => {
          return { images: ['base64-image-1', 'base64-image-2'] };
        },
      }),
      prompt,
    });

    expect(result.images).toStrictEqual(['base64-image-1', 'base64-image-2']);
  });

  it('should return the first image', async () => {
    const result = await generateImage({
      model: new MockImageModelV1({
        doGenerate: async () => {
          return { images: ['base64-image-1', 'base64-image-2'] };
        },
      }),
      prompt,
    });

    expect(result.image).toStrictEqual('base64-image-1');
  });
});
