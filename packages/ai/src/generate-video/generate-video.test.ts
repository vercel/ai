import type {
  Experimental_VideoModelV3 as VideoModelV3,
  Experimental_VideoModelV3VideoData as VideoModelV3VideoData,
  Experimental_VideoModelV3OperationWebhook as VideoModelV3OperationWebhook,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  test,
  vi,
  vitest,
} from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockVideoModelV3 } from '../test/mock-video-model-v3';
import type { Warning } from '../types/warning';
import { experimental_generateVideo } from './generate-video';

const prompt = 'a cat walking on a beach';
const testDate = new Date(2024, 0, 1);

const mp4Base64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
const webmBase64 = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2Vib';

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

const createMockResponse = (options: {
  videos: VideoModelV3VideoData[];
  warnings?: Warning[];
  timestamp?: Date;
  modelId?: string;
  providerMetadata?: SharedV3ProviderMetadata;
  headers?: Record<string, string>;
}) => ({
  videos: options.videos,
  warnings: options.warnings ?? [],
  providerMetadata: options.providerMetadata ?? {
    testProvider: {
      videos: options.videos.map(() => null),
    },
  },
  response: {
    timestamp: options.timestamp ?? new Date(),
    modelId: options.modelId ?? 'test-model-id',
    headers: options.headers ?? {},
  },
});

describe('experimental_generateVideo', () => {
  let logWarningsSpy: ReturnType<typeof vitest.spyOn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    logWarningsSpy = vitest
      .spyOn(logWarningsModule, 'logWarnings')
      .mockImplementation(() => {});

    global.fetch = vi.fn(async () => {
      return new Response(convertBase64ToUint8Array(mp4Base64), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    logWarningsSpy.mockRestore();
    global.fetch = originalFetch;
  });

  it('should send args to doGenerate', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let capturedArgs!: Parameters<NonNullable<VideoModelV3['doGenerate']>>[0];

    await experimental_generateVideo({
      model: new MockVideoModelV3({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
          });
        },
      }),
      prompt,
      aspectRatio: '16:9',
      resolution: '1920x1080',
      duration: 5,
      fps: 30,
      seed: 12345,
      providerOptions: {
        'mock-provider': {
          loop: true,
        },
      },
      headers: {
        'custom-request-header': 'request-header-value',
      },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      n: 1,
      prompt,
      image: undefined,
      aspectRatio: '16:9',
      resolution: '1920x1080',
      duration: 5,
      fps: 30,
      seed: 12345,
      providerOptions: { 'mock-provider': { loop: true } },
      headers: {
        'custom-request-header': 'request-header-value',
        'user-agent': 'ai/0.0.0-test',
      },
      abortSignal,
    });
  });

  it('should return warnings', async () => {
    const result = await experimental_generateVideo({
      model: new MockVideoModelV3({
        doGenerate: async () =>
          createMockResponse({
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
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

  it('should call logWarnings with the correct warnings', async () => {
    const expectedWarnings: Warning[] = [
      {
        type: 'other',
        message: 'Setting is not supported',
      },
      {
        type: 'unsupported',
        feature: 'duration',
        details: 'Duration parameter not supported',
      },
    ];

    await experimental_generateVideo({
      model: new MockVideoModelV3({
        doGenerate: async () =>
          createMockResponse({
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            warnings: expectedWarnings,
          }),
      }),
      prompt,
    });

    expect(logWarningsSpy).toHaveBeenCalledOnce();
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: expectedWarnings,
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });

  it('should not call logWarnings when no warnings are present', async () => {
    await experimental_generateVideo({
      model: new MockVideoModelV3({
        doGenerate: async () =>
          createMockResponse({
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            warnings: [],
          }),
      }),
      prompt,
    });

    expect(logWarningsSpy).not.toHaveBeenCalled();
  });

  describe('base64 video data', () => {
    it('should return generated videos with correct mime types', async () => {
      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async () =>
            createMockResponse({
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                { type: 'base64', data: webmBase64, mediaType: 'video/webm' },
              ],
            }),
        }),
        prompt,
      });

      expect(result.videos.length).toBe(2);
      expect(result.videos[0].mediaType).toBe('video/mp4');
      expect(result.videos[1].mediaType).toBe('video/webm');
    });

    it('should return the first video', async () => {
      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async () =>
            createMockResponse({
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                { type: 'base64', data: webmBase64, mediaType: 'video/webm' },
              ],
            }),
        }),
        prompt,
      });

      expect(result.video.mediaType).toBe('video/mp4');
    });
  });

  describe('binary video data', () => {
    it('should return generated videos', async () => {
      const binaryData = convertBase64ToUint8Array(mp4Base64);

      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async () =>
            createMockResponse({
              videos: [
                { type: 'binary', data: binaryData, mediaType: 'video/mp4' },
              ],
            }),
        }),
        prompt,
      });

      expect(result.videos.length).toBe(1);
      expect(result.video.uint8Array).toStrictEqual(binaryData);
    });
  });

  describe('URL video data', () => {
    it('should fetch and return videos from URLs', async () => {
      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async () =>
            createMockResponse({
              videos: [
                {
                  type: 'url',
                  url: 'https://example.com/video.mp4',
                  mediaType: 'video/mp4',
                },
              ],
            }),
        }),
        prompt,
      });

      expect(global.fetch).toHaveBeenCalled();
      expect(result.videos.length).toBe(1);
    });

    it('should throw DownloadError when fetch fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => {
          return new Response(null, { status: 404, statusText: 'Not Found' });
        },
      );

      await expect(
        experimental_generateVideo({
          model: new MockVideoModelV3({
            doGenerate: async () =>
              createMockResponse({
                videos: [
                  {
                    type: 'url',
                    url: 'https://example.com/video.mp4',
                    mediaType: 'video/mp4',
                  },
                ],
              }),
          }),
          prompt,
        }),
      ).rejects.toThrow(
        'Failed to download https://example.com/video.mp4: 404 Not Found',
      );
    });

    it('should detect mediaType via signature when provider and download return application/octet-stream', async () => {
      // Mock fetch to return octet-stream content-type (simulating CDN behavior)
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => {
          return new Response(convertBase64ToUint8Array(mp4Base64), {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' },
          });
        },
      );

      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async () =>
            createMockResponse({
              videos: [
                {
                  type: 'url',
                  url: 'https://example.com/video',
                  // Provider also returns octet-stream (or could be empty)
                  mediaType: 'application/octet-stream',
                },
              ],
            }),
        }),
        prompt,
      });

      // Should detect MP4 from file signature, not use octet-stream
      expect(result.video.mediaType).toBe('video/mp4');
    });
  });

  describe('when several calls are required', () => {
    it('should generate videos', async () => {
      let callCount = 0;

      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          maxVideosPerCall: 2,
          doGenerate: async options => {
            switch (callCount++) {
              case 0:
                expect(options.n).toBe(2);
                return createMockResponse({
                  videos: [
                    { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                    { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                  ],
                });
              case 1:
                expect(options.n).toBe(1);
                return createMockResponse({
                  videos: [
                    {
                      type: 'base64',
                      data: webmBase64,
                      mediaType: 'video/webm',
                    },
                  ],
                });
              default:
                throw new Error('Unexpected call');
            }
          },
        }),
        prompt,
        n: 3,
      });

      expect(result.videos.length).toBe(3);
    });

    it('should aggregate warnings', async () => {
      const warning1: Warning = {
        type: 'other',
        message: 'Warning from call 1',
      };
      const warning2: Warning = {
        type: 'other',
        message: 'Warning from call 2',
      };

      let callCount = 0;

      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          maxVideosPerCall: 1,
          doGenerate: async () => {
            switch (callCount++) {
              case 0:
                return createMockResponse({
                  videos: [
                    { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                  ],
                  warnings: [warning1],
                });
              case 1:
                return createMockResponse({
                  videos: [
                    { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                  ],
                  warnings: [warning2],
                });
              default:
                throw new Error('Unexpected call');
            }
          },
        }),
        prompt,
        n: 2,
      });

      expect(result.warnings).toStrictEqual([warning1, warning2]);
    });

    test.each([
      ['sync method', () => 2],
      ['async method', async () => 2],
    ])(
      'should generate with maxVideosPerCall = %s',
      async (_, maxVideosPerCall) => {
        let callCount = 0;
        const maxVideosPerCallMock = vitest.fn(maxVideosPerCall);

        const result = await experimental_generateVideo({
          model: new MockVideoModelV3({
            maxVideosPerCall: maxVideosPerCallMock,
            doGenerate: async options => {
              switch (callCount++) {
                case 0:
                  expect(options.n).toBe(2);
                  return createMockResponse({
                    videos: [
                      {
                        type: 'base64',
                        data: mp4Base64,
                        mediaType: 'video/mp4',
                      },
                      {
                        type: 'base64',
                        data: mp4Base64,
                        mediaType: 'video/mp4',
                      },
                    ],
                  });
                case 1:
                  expect(options.n).toBe(1);
                  return createMockResponse({
                    videos: [
                      {
                        type: 'base64',
                        data: webmBase64,
                        mediaType: 'video/webm',
                      },
                    ],
                  });
                default:
                  throw new Error('Unexpected call');
              }
            },
          }),
          prompt,
          n: 3,
        });

        expect(result.videos.length).toBe(3);
        expect(maxVideosPerCallMock).toHaveBeenCalledTimes(1);
        expect(maxVideosPerCallMock).toHaveBeenCalledWith({
          modelId: 'mock-model-id',
        });
      },
    );
  });

  describe('error handling', () => {
    it('should throw NoVideoGeneratedError when no videos are returned', async () => {
      await expect(
        experimental_generateVideo({
          model: new MockVideoModelV3({
            doGenerate: async () =>
              createMockResponse({
                videos: [],
                timestamp: testDate,
              }),
          }),
          prompt,
        }),
      ).rejects.toMatchObject({
        name: 'AI_NoVideoGeneratedError',
        message: 'No video generated.',
        responses: [
          {
            timestamp: testDate,
            modelId: expect.any(String),
          },
        ],
      });
    });

    it('should include response headers in error when no videos generated', async () => {
      await expect(
        experimental_generateVideo({
          model: new MockVideoModelV3({
            doGenerate: async () =>
              createMockResponse({
                videos: [],
                timestamp: testDate,
                headers: {
                  'custom-response-header': 'response-header-value',
                },
              }),
          }),
          prompt,
        }),
      ).rejects.toMatchObject({
        name: 'AI_NoVideoGeneratedError',
        message: 'No video generated.',
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

    const result = await experimental_generateVideo({
      model: new MockVideoModelV3({
        doGenerate: async () =>
          createMockResponse({
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
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
        providerMetadata: {
          testProvider: {
            videos: [null],
          },
        },
      },
    ]);
  });

  it('should return provider metadata', async () => {
    const result = await experimental_generateVideo({
      model: new MockVideoModelV3({
        doGenerate: async () =>
          createMockResponse({
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            timestamp: testDate,
            modelId: 'test-model',
            providerMetadata: {
              testProvider: {
                videos: [{ seed: 12345, duration: 5 }],
              },
            },
            headers: {},
          }),
      }),
      prompt,
    });

    expect(result.providerMetadata).toStrictEqual({
      testProvider: {
        videos: [{ seed: 12345, duration: 5 }],
      },
    });
  });

  describe('provider metadata merging', () => {
    it('should merge provider metadata from multiple calls', async () => {
      let callCount = 0;

      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          maxVideosPerCall: 1,
          doGenerate: async () => {
            switch (callCount++) {
              case 0:
                return createMockResponse({
                  videos: [
                    { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                  ],
                  providerMetadata: {
                    testProvider: {
                      videos: [{ seed: 111 }],
                    },
                  },
                });
              case 1:
                return createMockResponse({
                  videos: [
                    { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                  ],
                  providerMetadata: {
                    testProvider: {
                      videos: [{ seed: 222 }],
                    },
                  },
                });
              default:
                throw new Error('Unexpected call');
            }
          },
        }),
        prompt,
        n: 2,
      });

      expect(result.providerMetadata).toStrictEqual({
        testProvider: {
          videos: [{ seed: 111 }, { seed: 222 }],
        },
      });
    });

    it('should handle gateway provider metadata', async () => {
      let callCount = 0;

      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          maxVideosPerCall: 1,
          doGenerate: async () => {
            switch (callCount++) {
              case 0:
                return createMockResponse({
                  videos: [
                    { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                  ],
                  providerMetadata: {
                    gateway: {
                      videos: [{ seed: 111 }],
                      routing: { provider: 'fal' },
                    },
                  },
                });
              case 1:
                return createMockResponse({
                  videos: [
                    { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                  ],
                  providerMetadata: {
                    gateway: {
                      videos: [{ seed: 222 }],
                      cost: '0.08',
                    },
                  },
                });
              default:
                throw new Error('Unexpected call');
            }
          },
        }),
        prompt,
        n: 2,
      });

      // Gateway metadata is merged like any other provider
      expect(result.providerMetadata.gateway).toStrictEqual({
        videos: [{ seed: 111 }, { seed: 222 }],
        routing: { provider: 'fal' },
        cost: '0.08',
      });
    });

    it('should handle undefined providerMetadata', async () => {
      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async () => ({
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            warnings: [],
            providerMetadata: undefined,
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          }),
        }),
        prompt,
      });

      expect(result.providerMetadata).toStrictEqual({});
    });

    it('should preserve per-call providerMetadata in responses array', async () => {
      let callCount = 0;

      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          maxVideosPerCall: 1,
          doGenerate: async () => {
            switch (callCount++) {
              case 0:
                return createMockResponse({
                  videos: [
                    { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                  ],
                  providerMetadata: {
                    testProvider: {
                      videos: [{ seed: 111, duration: 5 }],
                      requestId: 'req-001',
                    },
                  },
                });
              case 1:
                return createMockResponse({
                  videos: [
                    { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
                  ],
                  providerMetadata: {
                    testProvider: {
                      videos: [{ seed: 222, duration: 8 }],
                      requestId: 'req-002',
                    },
                  },
                });
              default:
                throw new Error('Unexpected call');
            }
          },
        }),
        prompt,
        n: 2,
      });

      // Verify per-call metadata is preserved in responses array
      expect(result.responses).toHaveLength(2);
      expect(result.responses[0].providerMetadata).toStrictEqual({
        testProvider: {
          videos: [{ seed: 111, duration: 5 }],
          requestId: 'req-001',
        },
      });
      expect(result.responses[1].providerMetadata).toStrictEqual({
        testProvider: {
          videos: [{ seed: 222, duration: 8 }],
          requestId: 'req-002',
        },
      });

      // Top-level merged metadata still works
      expect(result.providerMetadata).toStrictEqual({
        testProvider: {
          videos: [
            { seed: 111, duration: 5 },
            { seed: 222, duration: 8 },
          ],
          requestId: 'req-002', // Last call wins for non-array fields
        },
      });
    });
  });

  describe('prompt normalization', () => {
    it('should handle string prompt', async () => {
      let capturedArgs!: Parameters<NonNullable<VideoModelV3['doGenerate']>>[0];

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async args => {
            capturedArgs = args;
            return createMockResponse({
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
            });
          },
        }),
        prompt: 'a simple text prompt',
      });

      expect(capturedArgs.prompt).toBe('a simple text prompt');
      expect(capturedArgs.image).toBeUndefined();
    });

    it('should handle object prompt with text and image', async () => {
      let capturedArgs!: Parameters<NonNullable<VideoModelV3['doGenerate']>>[0];
      const imageBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async args => {
            capturedArgs = args;
            return createMockResponse({
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
            });
          },
        }),
        prompt: {
          text: 'image to video prompt',
          image: imageBase64,
        },
      });

      expect(capturedArgs.prompt).toBe('image to video prompt');
      expect(capturedArgs.image).toBeDefined();
    });

    it('should handle URL image in prompt', async () => {
      let capturedArgs!: Parameters<NonNullable<VideoModelV3['doGenerate']>>[0];

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async args => {
            capturedArgs = args;
            return createMockResponse({
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
            });
          },
        }),
        prompt: {
          image: 'https://example.com/image.png',
        },
      });

      expect(capturedArgs.image).toStrictEqual({
        type: 'url',
        url: 'https://example.com/image.png',
      });
    });

    it('should handle data URL image in prompt', async () => {
      let capturedArgs!: Parameters<NonNullable<VideoModelV3['doGenerate']>>[0];
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
      const dataUrl = `data:image/png;base64,${pngBase64}`;

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async args => {
            capturedArgs = args;
            return createMockResponse({
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
            });
          },
        }),
        prompt: {
          image: dataUrl,
        },
      });

      expect(capturedArgs.image).toStrictEqual({
        type: 'file',
        data: convertBase64ToUint8Array(pngBase64),
        mediaType: 'image/png',
      });
    });

    it('should handle Uint8Array image in prompt', async () => {
      let capturedArgs!: Parameters<NonNullable<VideoModelV3['doGenerate']>>[0];
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
      const uint8Array = convertBase64ToUint8Array(pngBase64);

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async args => {
            capturedArgs = args;
            return createMockResponse({
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
            });
          },
        }),
        prompt: {
          image: uint8Array,
        },
      });

      expect(capturedArgs.image).toBeDefined();
      expect(capturedArgs.image?.type).toBe('file');
    });

    it('should detect image mediaType from raw base64 string via signature detection', async () => {
      let capturedArgs!: Parameters<NonNullable<VideoModelV3['doGenerate']>>[0];
      // Raw base64 PNG (not a data URL) - must be detected via signature
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async args => {
            capturedArgs = args;
            return createMockResponse({
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
            });
          },
        }),
        prompt: {
          image: pngBase64,
        },
      });

      expect(capturedArgs.image).toStrictEqual({
        type: 'file',
        data: convertBase64ToUint8Array(pngBase64),
        mediaType: 'image/png',
      });
    });

    it('should detect image mediaType from Uint8Array via signature detection', async () => {
      let capturedArgs!: Parameters<NonNullable<VideoModelV3['doGenerate']>>[0];
      // JPEG magic bytes: 0xFF 0xD8 0xFF
      const jpegBytes = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
      ]);

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async args => {
            capturedArgs = args;
            return createMockResponse({
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
            });
          },
        }),
        prompt: {
          image: jpegBytes,
        },
      });

      expect(capturedArgs.image).toBeDefined();
      expect(capturedArgs.image?.type).toBe('file');
      if (capturedArgs.image?.type === 'file') {
        expect(capturedArgs.image.mediaType).toBe('image/jpeg');
      }
    });
  });

  describe('doStart/doStatus flow', () => {
    it('should use doStart/doStatus when poll is provided and model supports it', async () => {
      let startCalled = false;
      let statusCallCount = 0;

      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: undefined,
          doStart: async options => {
            startCalled = true;
            expect(options.prompt).toBe(prompt);
            return {
              operation: { taskId: 'task-123' },
              warnings: [],
              response: {
                timestamp: new Date(),
                modelId: 'test-model-id',
                headers: {},
              },
            };
          },
          doStatus: async options => {
            statusCallCount++;
            expect(options.operation).toStrictEqual({ taskId: 'task-123' });
            if (statusCallCount < 3) {
              return {
                status: 'pending' as const,
                response: {
                  timestamp: new Date(),
                  modelId: 'test-model-id',
                  headers: {},
                },
              };
            }
            return {
              status: 'completed' as const,
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
              warnings: [],
              response: {
                timestamp: new Date(),
                modelId: 'test-model-id',
                headers: {},
              },
            };
          },
        }),
        prompt,
        poll: { intervalMs: 10 },
      });

      expect(startCalled).toBe(true);
      expect(statusCallCount).toBe(3);
      expect(result.videos.length).toBe(1);
    });

    it('should use doStart/doStatus when model only has doStart/doStatus (no doGenerate)', async () => {
      let doGenerateCalled = false;

      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: undefined,
          doStart: async () => ({
            operation: 'op-1',
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          }),
          doStatus: async () => ({
            status: 'completed' as const,
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          }),
        }),
        prompt,
        poll: { intervalMs: 10 },
      });

      expect(doGenerateCalled).toBe(false);
      expect(result.videos.length).toBe(1);
    });

    it('should fall back to doGenerate when poll is provided but model lacks doStart/doStatus', async () => {
      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: async () =>
            createMockResponse({
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
            }),
        }),
        prompt,
        poll: { intervalMs: 10 },
      });

      expect(result.videos.length).toBe(1);
    });

    it('should throw error when model lacks both doGenerate and doStart/doStatus', async () => {
      await expect(
        experimental_generateVideo({
          model: new MockVideoModelV3({
            doGenerate: undefined,
          }),
          prompt,
        }),
      ).rejects.toThrow(
        'Video model mock-model-id does not implement doGenerate or doStart/doStatus.',
      );
    });

    it('should use custom intervalMs for polling', async () => {
      const timestamps: number[] = [];
      let statusCallCount = 0;

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: undefined,
          doStart: async () => ({
            operation: 'op-1',
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          }),
          doStatus: async () => {
            statusCallCount++;
            timestamps.push(Date.now());
            if (statusCallCount < 2) {
              return {
                status: 'pending' as const,
                response: {
                  timestamp: new Date(),
                  modelId: 'test-model-id',
                  headers: {},
                },
              };
            }
            return {
              status: 'completed' as const,
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
              warnings: [],
              response: {
                timestamp: new Date(),
                modelId: 'test-model-id',
                headers: {},
              },
            };
          },
        }),
        prompt,
        poll: { intervalMs: 50 },
      });

      expect(statusCallCount).toBe(2);
      // Verify the interval was roughly 50ms (allow some tolerance)
      const diff = timestamps[1] - timestamps[0];
      expect(diff).toBeGreaterThanOrEqual(30);
    });

    it('should use exponential backoff', async () => {
      const timestamps: number[] = [];
      let statusCallCount = 0;

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: undefined,
          doStart: async () => ({
            operation: 'op-1',
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          }),
          doStatus: async () => {
            statusCallCount++;
            timestamps.push(Date.now());
            if (statusCallCount < 3) {
              return {
                status: 'pending' as const,
                response: {
                  timestamp: new Date(),
                  modelId: 'test-model-id',
                  headers: {},
                },
              };
            }
            return {
              status: 'completed' as const,
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
              warnings: [],
              response: {
                timestamp: new Date(),
                modelId: 'test-model-id',
                headers: {},
              },
            };
          },
        }),
        prompt,
        poll: { intervalMs: 20, backoff: 'exponential' },
      });

      expect(statusCallCount).toBe(3);
      // First interval: 20ms (20 * 2^0), second interval: 40ms (20 * 2^1)
      const diff1 = timestamps[1] - timestamps[0];
      const diff2 = timestamps[2] - timestamps[1];
      expect(diff2).toBeGreaterThan(diff1);
    });

    it('should call onAttempt callback before each poll', async () => {
      const attempts: Array<{ attempt: number; elapsedMs: number }> = [];
      let statusCallCount = 0;

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: undefined,
          doStart: async () => ({
            operation: 'op-1',
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          }),
          doStatus: async () => {
            statusCallCount++;
            if (statusCallCount < 3) {
              return {
                status: 'pending' as const,
                response: {
                  timestamp: new Date(),
                  modelId: 'test-model-id',
                  headers: {},
                },
              };
            }
            return {
              status: 'completed' as const,
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
              warnings: [],
              response: {
                timestamp: new Date(),
                modelId: 'test-model-id',
                headers: {},
              },
            };
          },
        }),
        prompt,
        poll: {
          intervalMs: 10,
          onAttempt: event => {
            attempts.push(event);
          },
        },
      });

      expect(attempts.length).toBe(3);
      expect(attempts[0].attempt).toBe(1);
      expect(attempts[1].attempt).toBe(2);
      expect(attempts[2].attempt).toBe(3);
      expect(attempts[0].elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw timeout error when polling exceeds timeoutMs', async () => {
      await expect(
        experimental_generateVideo({
          model: new MockVideoModelV3({
            doGenerate: undefined,
            doStart: async () => ({
              operation: 'op-1',
              warnings: [],
              response: {
                timestamp: new Date(),
                modelId: 'test-model-id',
                headers: {},
              },
            }),
            doStatus: async () => ({
              status: 'pending' as const,
              response: {
                timestamp: new Date(),
                modelId: 'test-model-id',
                headers: {},
              },
            }),
          }),
          prompt,
          poll: { intervalMs: 10, timeoutMs: 50 },
        }),
      ).rejects.toThrow('Video generation timed out after 50ms.');
    });

    it('should merge warnings from doStart and doStatus', async () => {
      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: undefined,
          doStart: async () => ({
            operation: 'op-1',
            warnings: [{ type: 'other', message: 'start warning' }],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          }),
          doStatus: async () => ({
            status: 'completed' as const,
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            warnings: [{ type: 'other', message: 'status warning' }],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          }),
        }),
        prompt,
        poll: { intervalMs: 10 },
      });

      expect(result.warnings).toStrictEqual([
        { type: 'other', message: 'start warning' },
        { type: 'other', message: 'status warning' },
      ]);
    });

    it('should use webhook flow when webhook is provided', async () => {
      let webhookUrlCapture: string | undefined;
      let resolveWebhook: (value: VideoModelV3OperationWebhook) => void;
      const webhookReceived = new Promise<VideoModelV3OperationWebhook>(
        resolve => {
          resolveWebhook = resolve;
        },
      );

      const model = new MockVideoModelV3({
        doGenerate: undefined,
        handleWebhookOption: async ({ webhook }) => {
          const { url, received } = await webhook();
          return { webhookUrl: url, received };
        },
        doStart: async options => {
          webhookUrlCapture = options.webhookUrl;
          // Simulate async webhook notification
          setTimeout(() => resolveWebhook!({ headers: {}, body: {} }), 10);
          return {
            operation: 'op-webhook',
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          };
        },
        doStatus: async options => {
          expect(options.operation).toBe('op-webhook');
          return {
            status: 'completed' as const,
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          };
        },
      });

      const result = await experimental_generateVideo({
        model,
        prompt,
        webhook: async () => ({
          url: 'https://example.com/webhook',
          received: webhookReceived,
        }),
      });

      expect(webhookUrlCapture).toBe('https://example.com/webhook');
      expect(result.videos.length).toBe(1);
    });

    it('should use webhook over poll when both are provided', async () => {
      let statusCallCount = 0;
      let resolveWebhook: (value: VideoModelV3OperationWebhook) => void;
      const webhookReceived = new Promise<VideoModelV3OperationWebhook>(
        resolve => {
          resolveWebhook = resolve;
        },
      );

      const model = new MockVideoModelV3({
        doGenerate: undefined,
        handleWebhookOption: async ({ webhook }) => {
          const { url, received } = await webhook();
          return { webhookUrl: url, received };
        },
        doStart: async options => {
          expect(options.webhookUrl).toBe('https://example.com/webhook');
          setTimeout(() => resolveWebhook!({ headers: {}, body: {} }), 10);
          return {
            operation: 'op-both',
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          };
        },
        doStatus: async () => {
          statusCallCount++;
          return {
            status: 'completed' as const,
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          };
        },
      });

      const result = await experimental_generateVideo({
        model,
        prompt,
        poll: { intervalMs: 10 },
        webhook: async () => ({
          url: 'https://example.com/webhook',
          received: webhookReceived,
        }),
      });

      // Should only call doStatus once (after webhook), not via polling loop
      expect(statusCallCount).toBe(1);
      expect(result.videos.length).toBe(1);
    });

    it('should fall back to polling when model has no handleWebhookOption', async () => {
      let statusCallCount = 0;
      let webhookFactoryCalled = false;

      const model = new MockVideoModelV3({
        doGenerate: undefined,
        // no handleWebhookOption — model does not support webhooks
        doStart: async () => ({
          operation: 'op-fallback',
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: 'test-model-id',
            headers: {},
          },
        }),
        doStatus: async () => {
          statusCallCount++;
          return {
            status: 'completed' as const,
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          };
        },
      });

      const result = await experimental_generateVideo({
        model,
        prompt,
        poll: { intervalMs: 10 },
        webhook: async () => {
          webhookFactoryCalled = true;
          return {
            url: 'https://example.com/webhook',
            received: new Promise<VideoModelV3OperationWebhook>(() => {}),
          };
        },
      });

      // Webhook factory should never be called
      expect(webhookFactoryCalled).toBe(false);
      // Should have used polling instead
      expect(statusCallCount).toBeGreaterThanOrEqual(1);
      expect(result.videos.length).toBe(1);
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'webhook',
        details:
          'This model does not support webhooks. Falling back to polling.',
      });
    });

    it('should handle n > maxVideosPerCall with doStart/doStatus', async () => {
      let startCallCount = 0;

      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          maxVideosPerCall: 1,
          doGenerate: undefined,
          doStart: async options => {
            startCallCount++;
            return {
              operation: `op-${startCallCount}`,
              warnings: [],
              response: {
                timestamp: new Date(),
                modelId: 'test-model-id',
                headers: {},
              },
            };
          },
          doStatus: async () => ({
            status: 'completed' as const,
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          }),
        }),
        prompt,
        n: 3,
        poll: { intervalMs: 10 },
      });

      expect(startCallCount).toBe(3);
      expect(result.videos.length).toBe(3);
    });

    it('should return provider metadata from doStart/doStatus flow', async () => {
      const result = await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: undefined,
          doStart: async () => ({
            operation: 'op-1',
            warnings: [],
            providerMetadata: {
              testProvider: { requestId: 'req-001' },
            },
            response: {
              timestamp: testDate,
              modelId: 'test-model',
              headers: {},
            },
          }),
          doStatus: async () => ({
            status: 'completed' as const,
            videos: [
              { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
            ],
            warnings: [],
            providerMetadata: {
              testProvider: {
                videos: [{ duration: 5 }],
              },
            },
            response: {
              timestamp: testDate,
              modelId: 'test-model',
              headers: {},
            },
          }),
        }),
        prompt,
        poll: { intervalMs: 10 },
      });

      // providerMetadata on the result comes from the completed status
      expect(result.providerMetadata).toStrictEqual({
        testProvider: {
          videos: [{ duration: 5 }],
        },
      });
    });

    it('should pass headers and abortSignal to doStatus', async () => {
      const abortController = new AbortController();
      let capturedStatusOptions: any;

      await experimental_generateVideo({
        model: new MockVideoModelV3({
          doGenerate: undefined,
          doStart: async () => ({
            operation: 'op-1',
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'test-model-id',
              headers: {},
            },
          }),
          doStatus: async options => {
            capturedStatusOptions = options;
            return {
              status: 'completed' as const,
              videos: [
                { type: 'base64', data: mp4Base64, mediaType: 'video/mp4' },
              ],
              warnings: [],
              response: {
                timestamp: new Date(),
                modelId: 'test-model-id',
                headers: {},
              },
            };
          },
        }),
        prompt,
        poll: { intervalMs: 10 },
        headers: { 'x-custom': 'value' },
        abortSignal: abortController.signal,
      });

      expect(capturedStatusOptions.operation).toBe('op-1');
      expect(capturedStatusOptions.abortSignal).toBe(abortController.signal);
      expect(capturedStatusOptions.headers).toStrictEqual({
        'x-custom': 'value',
        'user-agent': 'ai/0.0.0-test',
      });
    });
  });
});
