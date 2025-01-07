import { ImageModelV1 } from '@ai-sdk/provider';
import { MockImageModelV1 } from '../test/mock-image-model-v1';
import { generateImage } from './generate-image';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';

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
          return { images: [], warnings: [] };
        },
      }),
      prompt,
      size: '1024x1024',
      aspectRatio: '16:9',
      seed: 12345,
      providerOptions: { openai: { style: 'vivid' } },
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      n: 1,
      prompt,
      size: '1024x1024',
      aspectRatio: '16:9',
      seed: 12345,
      providerOptions: { openai: { style: 'vivid' } },
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });
  });

  it('should return warnings', async () => {
    const result = await generateImage({
      model: new MockImageModelV1({
        doGenerate: async () => ({
          images: [],
          warnings: [
            {
              type: 'other',
              message: 'Setting is not supported',
            },
          ],
        }),
      }),
      prompt,
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'other',
        message: 'Setting is not supported',
      },
    ]);
  });

  describe('base64 image data', () => {
    it('should return generated images', async () => {
      const base64Images = [
        'SGVsbG8gV29ybGQ=', // "Hello World" in base64
        'VGVzdGluZw==', // "Testing" in base64
      ];

      const result = await generateImage({
        model: new MockImageModelV1({
          doGenerate: async () => ({ images: base64Images, warnings: [] }),
        }),
        prompt,
      });

      expect(
        result.images.map(image => ({
          base64: image.base64,
          uint8Array: image.uint8Array,
        })),
      ).toStrictEqual([
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
          doGenerate: async () => ({
            images: [base64Image, 'base64-image-2'],
            warnings: [],
          }),
        }),
        prompt,
      });

      expect({
        base64: result.image.base64,
        uint8Array: result.image.uint8Array,
      }).toStrictEqual({
        base64: base64Image,
        uint8Array: convertBase64ToUint8Array(base64Image),
      });
    });
  });

  describe('uint8array image data', () => {
    it('should return generated images', async () => {
      const uint8ArrayImages = [
        convertBase64ToUint8Array('SGVsbG8gV29ybGQ='), // "Hello World" in base64
        convertBase64ToUint8Array('VGVzdGluZw=='), // "Testing" in base64
      ];

      const result = await generateImage({
        model: new MockImageModelV1({
          doGenerate: async () => ({ images: uint8ArrayImages, warnings: [] }),
        }),
        prompt,
      });

      expect(
        result.images.map(image => ({
          base64: image.base64,
          uint8Array: image.uint8Array,
        })),
      ).toStrictEqual([
        {
          base64: convertUint8ArrayToBase64(uint8ArrayImages[0]),
          uint8Array: uint8ArrayImages[0],
        },
        {
          base64: convertUint8ArrayToBase64(uint8ArrayImages[1]),
          uint8Array: uint8ArrayImages[1],
        },
      ]);
    });
  });
});
