import { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import { MockImageModelV1 } from '../test/mock-image-model-v1';
import { generateImage } from './generate-image';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';

const prompt = 'sunny day at the beach';
const testDate = new Date(2024, 0, 1);

const createMockResponse = (options: {
  images: string[] | Uint8Array[];
  warnings?: ImageModelV1CallWarning[];
  timestamp?: Date;
  modelId?: string;
  headers?: Record<string, string>;
}) => ({
  images: options.images,
  warnings: options.warnings ?? [],
  response: {
    timestamp: options.timestamp ?? new Date(),
    modelId: options.modelId ?? 'test-model-id',
    headers: options.headers ?? {},
  },
});

describe('generateImage', () => {
  // 1x1 transparent PNG
  const mockBase64Image =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

  it('should send args to doGenerate', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let capturedArgs!: Parameters<ImageModelV1['doGenerate']>[0];

    await generateImage({
      model: new MockImageModelV1({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            images: [mockBase64Image],
          });
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
        doGenerate: async () =>
          createMockResponse({
            images: [mockBase64Image],
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
          doGenerate: async () =>
            createMockResponse({
              images: base64Images,
            }),
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
          doGenerate: async () =>
            createMockResponse({
              images: [base64Image, 'base64-image-2'],
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
          doGenerate: async () =>
            createMockResponse({
              images: uint8ArrayImages,
            }),
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

  describe('when several calls are required', () => {
    it('should generate images', async () => {
      const base64Images = [
        'SGVsbG8gV29ybGQ=', // "Hello World" in base64
        'VGVzdGluZw==', // "Testing" in base64
        'MTIz', // "123" in base64
      ];

      let callCount = 0;

      const result = await generateImage({
        model: new MockImageModelV1({
          maxImagesPerCall: 2,
          doGenerate: async options => {
            switch (callCount++) {
              case 0:
                expect(options).toStrictEqual({
                  prompt,
                  n: 2,
                  seed: 12345,
                  size: '1024x1024',
                  aspectRatio: '16:9',
                  providerOptions: { openai: { style: 'vivid' } },
                  headers: { 'custom-request-header': 'request-header-value' },
                  abortSignal: undefined,
                });
                return createMockResponse({
                  images: base64Images.slice(0, 2),
                });
              case 1:
                expect(options).toStrictEqual({
                  prompt,
                  n: 1,
                  seed: 12345,
                  size: '1024x1024',
                  aspectRatio: '16:9',
                  providerOptions: { openai: { style: 'vivid' } },
                  headers: { 'custom-request-header': 'request-header-value' },
                  abortSignal: undefined,
                });
                return createMockResponse({
                  images: base64Images.slice(2),
                });
              default:
                throw new Error('Unexpected call');
            }
          },
        }),
        prompt,
        n: 3,
        size: '1024x1024',
        aspectRatio: '16:9',
        seed: 12345,
        providerOptions: { openai: { style: 'vivid' } },
        headers: { 'custom-request-header': 'request-header-value' },
      });

      expect(result.images.map(image => image.base64)).toStrictEqual(
        base64Images,
      );
    });

    it('should aggregate warnings', async () => {
      const base64Images = [
        'SGVsbG8gV29ybGQ=', // "Hello World" in base64
        'VGVzdGluZw==', // "Testing" in base64
        'MTIz', // "123" in base64
      ];

      let callCount = 0;

      const result = await generateImage({
        model: new MockImageModelV1({
          maxImagesPerCall: 2,
          doGenerate: async options => {
            switch (callCount++) {
              case 0:
                expect(options).toStrictEqual({
                  prompt,
                  n: 2,
                  seed: 12345,
                  size: '1024x1024',
                  aspectRatio: '16:9',
                  providerOptions: { openai: { style: 'vivid' } },
                  headers: { 'custom-request-header': 'request-header-value' },
                  abortSignal: undefined,
                });
                return createMockResponse({
                  images: base64Images.slice(0, 2),
                  warnings: [{ type: 'other', message: '1' }],
                });
              case 1:
                expect(options).toStrictEqual({
                  prompt,
                  n: 1,
                  seed: 12345,
                  size: '1024x1024',
                  aspectRatio: '16:9',
                  providerOptions: { openai: { style: 'vivid' } },
                  headers: { 'custom-request-header': 'request-header-value' },
                  abortSignal: undefined,
                });
                return createMockResponse({
                  images: base64Images.slice(2),
                  warnings: [{ type: 'other', message: '2' }],
                });
              default:
                throw new Error('Unexpected call');
            }
          },
        }),
        prompt,
        n: 3,
        size: '1024x1024',
        aspectRatio: '16:9',
        seed: 12345,
        providerOptions: { openai: { style: 'vivid' } },
        headers: { 'custom-request-header': 'request-header-value' },
      });

      expect(result.warnings).toStrictEqual([
        { type: 'other', message: '1' },
        { type: 'other', message: '2' },
      ]);
    });
  });

  describe('error handling', () => {
    it('should throw NoImageGeneratedError when no images are returned', async () => {
      await expect(
        generateImage({
          model: new MockImageModelV1({
            doGenerate: async () =>
              createMockResponse({
                images: [],
                timestamp: testDate,
              }),
          }),
          prompt,
        }),
      ).rejects.toMatchObject({
        name: 'AI_NoImageGeneratedError',
        message: 'No image generated.',
        responses: [
          {
            timestamp: testDate,
            modelId: expect.any(String),
          },
        ],
      });
    });

    it('should include response headers in error when no images generated', async () => {
      await expect(
        generateImage({
          model: new MockImageModelV1({
            doGenerate: async () =>
              createMockResponse({
                images: [],
                timestamp: testDate,
                headers: {
                  'custom-response-header': 'response-header-value',
                },
              }),
          }),
          prompt,
        }),
      ).rejects.toMatchObject({
        name: 'AI_NoImageGeneratedError',
        message: 'No image generated.',
        responses: [
          {
            timestamp: testDate,
            modelId: expect.any(String),
            headers: {
              'custom-response-header': 'response-header-value',
            },
          },
        ],
      });
    });
  });

  it('should return response metadata', async () => {
    const testHeaders = { 'x-test': 'value' };

    const result = await generateImage({
      model: new MockImageModelV1({
        doGenerate: async () =>
          createMockResponse({
            images: [mockBase64Image],
            timestamp: testDate,
            modelId: 'test-model',
            headers: testHeaders,
          }),
      }),
      prompt,
    });

    expect(result.responses).toStrictEqual([
      {
        timestamp: testDate,
        modelId: 'test-model',
        headers: testHeaders,
      },
    ]);
  });
});
