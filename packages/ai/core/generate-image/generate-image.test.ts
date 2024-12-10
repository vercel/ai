import { ImageModelV1 } from '@ai-sdk/provider';
import { MockImageModelV1 } from '../test/mock-image-model-v1';
import { generateImage } from './generate-image';
import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';

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
      providerOptions: { openai: { style: 'vivid' } },
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      n: 1,
      prompt,
      size: '1024x1024',
      providerOptions: { openai: { style: 'vivid' } },
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });
  });

  it('should return generated images', async () => {
    const base64Images = [
      'SGVsbG8gV29ybGQ=', // "Hello World" in base64
      'VGVzdGluZw==', // "Testing" in base64
    ];

    const result = await generateImage({
      model: new MockImageModelV1({
        doGenerate: async () => ({ images: base64Images }),
      }),
      prompt,
    });

    expect(result.images).toStrictEqual([
      {
        base64: base64Images[0],
        uint8Array: convertBase64ToUint8Array(base64Images[0]),
      },
      {
        base64: base64Images[1],
        uint8Array: convertBase64ToUint8Array(base64Images[1]),
      },
    ]);
  });

  it('should return the first image', async () => {
    const base64Image = 'SGVsbG8gV29ybGQ='; // "Hello World" in base64

    const result = await generateImage({
      model: new MockImageModelV1({
        doGenerate: async () => ({ images: [base64Image, 'base64-image-2'] }),
      }),
      prompt,
    });

    expect(result.image).toStrictEqual({
      base64: base64Image,
      uint8Array: convertBase64ToUint8Array(base64Image),
    });
  });
});
