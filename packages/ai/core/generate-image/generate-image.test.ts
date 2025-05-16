import {
  ImageModelV2,
  ImageModelV2CallWarning,
  ImageModelV2ProviderMetadata,
} from '@ai-sdk/provider';
import { MockImageModelV2 } from '../test/mock-image-model-v2';
import { generateImage } from './generate-image';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';

const prompt = 'sunny day at the beach';
const testDate = new Date(2024, 0, 1);

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='; // 1x1 transparent PNG
const jpegBase64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='; // 1x1 black JPEG
const gifBase64 = 'R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='; // 1x1 transparent GIF

const createMockResponse = (options: {
  images: string[] | Uint8Array[];
  warnings?: ImageModelV2CallWarning[];
  timestamp?: Date;
  modelId?: string;
  providerMetaData?: ImageModelV2ProviderMetadata;
  headers?: Record<string, string>;
}) => ({
  images: options.images,
  warnings: options.warnings ?? [],
  providerMetadata: options.providerMetaData ?? {
    testProvider: {
      images: options.images.map(() => null),
    },
  },
  response: {
    timestamp: options.timestamp ?? new Date(),
    modelId: options.modelId ?? 'test-model-id',
    headers: options.headers ?? {},
  },
});

describe('generateImage', () => {
  it('should send args to doGenerate', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let capturedArgs!: Parameters<ImageModelV2['doGenerate']>[0];

    await generateImage({
      model: new MockImageModelV2({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            images: [pngBase64],
          });
        },
      }),
      prompt,
      size: '1024x1024',
      aspectRatio: '16:9',
      seed: 12345,
      providerOptions: {
        'mock-provider': {
          style: 'vivid',
        },
      },
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      n: 1,
      prompt,
      size: '1024x1024',
      aspectRatio: '16:9',
      seed: 12345,
      providerOptions: { 'mock-provider': { style: 'vivid' } },
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });
  });

  it('should return warnings', async () => {
    const result = await generateImage({
      model: new MockImageModelV2({
        doGenerate: async () =>
          createMockResponse({
            images: [pngBase64],
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
    it('should return generated images with correct mime types', async () => {
      const result = await generateImage({
        model: new MockImageModelV2({
          doGenerate: async () =>
            createMockResponse({
              images: [pngBase64, jpegBase64],
            }),
        }),
        prompt,
      });

      expect(
        result.images.map(image => ({
          base64: image.base64,
          uint8Array: image.uint8Array,
          mediaType: image.mediaType,
        })),
      ).toStrictEqual([
        {
          base64: pngBase64,
          uint8Array: convertBase64ToUint8Array(pngBase64),
          mediaType: 'image/png',
        },
        {
          base64: jpegBase64,
          uint8Array: convertBase64ToUint8Array(jpegBase64),
          mediaType: 'image/jpeg',
        },
      ]);
    });

    it('should return the first image with correct mime type', async () => {
      const result = await generateImage({
        model: new MockImageModelV2({
          doGenerate: async () =>
            createMockResponse({
              images: [pngBase64, jpegBase64],
            }),
        }),
        prompt,
      });

      expect({
        base64: result.image.base64,
        uint8Array: result.image.uint8Array,
        mediaType: result.image.mediaType,
      }).toStrictEqual({
        base64: pngBase64,
        uint8Array: convertBase64ToUint8Array(pngBase64),
        mediaType: 'image/png',
      });
    });
  });

  describe('uint8array image data', () => {
    it('should return generated images', async () => {
      const uint8ArrayImages = [
        convertBase64ToUint8Array(pngBase64),
        convertBase64ToUint8Array(jpegBase64),
      ];

      const result = await generateImage({
        model: new MockImageModelV2({
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
      const base64Images = [pngBase64, jpegBase64, gifBase64];

      let callCount = 0;

      const result = await generateImage({
        model: new MockImageModelV2({
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
                  providerOptions: {
                    'mock-provider': { style: 'vivid' },
                  },
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
                  providerOptions: { 'mock-provider': { style: 'vivid' } },
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
        providerOptions: { 'mock-provider': { style: 'vivid' } },
        headers: { 'custom-request-header': 'request-header-value' },
      });

      expect(result.images.map(image => image.base64)).toStrictEqual(
        base64Images,
      );
    });

    it('should aggregate warnings', async () => {
      const base64Images = [pngBase64, jpegBase64, gifBase64];

      let callCount = 0;

      const result = await generateImage({
        model: new MockImageModelV2({
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
                  providerOptions: { 'mock-provider': { style: 'vivid' } },
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
                  providerOptions: { 'mock-provider': { style: 'vivid' } },
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
        providerOptions: { 'mock-provider': { style: 'vivid' } },
        headers: { 'custom-request-header': 'request-header-value' },
      });

      expect(result.warnings).toStrictEqual([
        { type: 'other', message: '1' },
        { type: 'other', message: '2' },
      ]);
    });

    test.each([
      ['sync method', () => 2],
      ['async method', async () => 2],
    ])(
      'should generate with maxImagesPerCall = %s',
      async (_, maxImagesPerCall) => {
        const base64Images = [pngBase64, jpegBase64, gifBase64];

        let callCount = 0;
        const maxImagesPerCallMock = vitest.fn(maxImagesPerCall);

        const result = await generateImage({
          model: new MockImageModelV2({
            maxImagesPerCall: maxImagesPerCallMock,
            doGenerate: async options => {
              switch (callCount++) {
                case 0:
                  expect(options).toStrictEqual({
                    prompt,
                    n: 2,
                    seed: 12345,
                    size: '1024x1024',
                    aspectRatio: '16:9',
                    providerOptions: {
                      'mock-provider': { style: 'vivid' },
                    },
                    headers: {
                      'custom-request-header': 'request-header-value',
                    },
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
                    providerOptions: { 'mock-provider': { style: 'vivid' } },
                    headers: {
                      'custom-request-header': 'request-header-value',
                    },
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
          providerOptions: { 'mock-provider': { style: 'vivid' } },
          headers: { 'custom-request-header': 'request-header-value' },
        });

        expect(result.images.map(image => image.base64)).toStrictEqual(
          base64Images,
        );
        expect(maxImagesPerCallMock).toHaveBeenCalledTimes(1);
        expect(maxImagesPerCallMock).toHaveBeenCalledWith({
          modelId: 'mock-model-id',
        });
      },
    );
  });

  describe('error handling', () => {
    it('should throw NoImageGeneratedError when no images are returned', async () => {
      await expect(
        generateImage({
          model: new MockImageModelV2({
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
          model: new MockImageModelV2({
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
      model: new MockImageModelV2({
        doGenerate: async () =>
          createMockResponse({
            images: [pngBase64],
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

  it('should return provider metadata', async () => {
    const result = await generateImage({
      model: new MockImageModelV2({
        doGenerate: async () =>
          createMockResponse({
            images: [pngBase64, pngBase64],
            timestamp: testDate,
            modelId: 'test-model',
            providerMetaData: {
              testProvider: {
                images: [{ revisedPrompt: 'test-revised-prompt' }, null],
              },
            },
            headers: {},
          }),
      }),
      prompt,
    });

    expect(result.providerMetadata).toStrictEqual({
      testProvider: {
        images: [{ revisedPrompt: 'test-revised-prompt' }, null],
      },
    });
  });
});
