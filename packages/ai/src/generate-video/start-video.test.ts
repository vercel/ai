import {
  APICallError,
  type Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
} from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { MockVideoModelV4 } from '../test/mock-video-model-v4';
import { experimental_startVideo } from './start-video';
import { experimental_getVideoStatus } from './get-video-status';

const prompt = 'a cat walking on a beach';
const testDate = new Date(2024, 0, 1);

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

const createStartResponse = (overrides: object = {}) => ({
  operation: { taskId: 'task-123' },
  warnings: [],
  response: { timestamp: testDate, modelId: 'test-model-id', headers: {} },
  ...overrides,
});

describe('experimental_startVideo', () => {
  it('should call doStart with a fully populated spec call-options object', async () => {
    let capturedOptions:
      | (VideoModelV4CallOptions & { webhookUrl?: string })
      | undefined;

    const result = await experimental_startVideo({
      model: new MockVideoModelV4({
        doStart: async options => {
          capturedOptions = options;
          return createStartResponse();
        },
      }),
      prompt,
    });

    expect(capturedOptions).toStrictEqual({
      prompt,
      n: 1,
      aspectRatio: undefined,
      resolution: undefined,
      duration: undefined,
      fps: undefined,
      seed: undefined,
      image: undefined,
      frameImages: undefined,
      inputReferences: undefined,
      generateAudio: undefined,
      providerOptions: {},
      headers: {
        'user-agent': `ai/0.0.0-test`,
        'idempotency-key': expect.stringMatching(/^aisdk_vid_/),
      },
      abortSignal: undefined,
      webhookUrl: undefined,
    });
    expect(result.operation).toStrictEqual({ taskId: 'task-123' });
  });

  it('should forward webhookUrl to doStart', async () => {
    let capturedOptions: { webhookUrl?: string } | undefined;

    await experimental_startVideo({
      model: new MockVideoModelV4({
        doStart: async options => {
          capturedOptions = options;
          return createStartResponse();
        },
      }),
      prompt,
      webhookUrl: 'https://example.com/hook',
    });

    expect(capturedOptions?.webhookUrl).toBe('https://example.com/hook');
  });

  it('should keep a caller-supplied idempotency key', async () => {
    let capturedHeaders: Record<string, string | undefined> | undefined;

    await experimental_startVideo({
      model: new MockVideoModelV4({
        doStart: async options => {
          capturedHeaders = options.headers;
          return createStartResponse();
        },
      }),
      prompt,
      headers: { 'Idempotency-Key': 'caller-key-1' },
    });

    expect(capturedHeaders?.['idempotency-key']).toBe('caller-key-1');
    expect(
      Object.keys(capturedHeaders ?? {}).filter(
        key => key.toLowerCase() === 'idempotency-key',
      ),
    ).toHaveLength(1);
  });

  it('should reuse one idempotency key across start retries', async () => {
    const seenKeys: Array<string | undefined> = [];

    await experimental_startVideo({
      model: new MockVideoModelV4({
        doStart: async options => {
          seenKeys.push(
            options.headers?.['idempotency-key'] as string | undefined,
          );
          if (seenKeys.length === 1) {
            throw new APICallError({
              message: 'lost response',
              url: 'https://example.com/start',
              requestBodyValues: {},
              statusCode: 500,
              responseHeaders: { 'retry-after-ms': '0' },
            });
          }
          return createStartResponse();
        },
      }),
      prompt,
    });

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).toBeDefined();
    expect(seenKeys[0]).toBe(seenKeys[1]);
  });

  it('should surface provider metadata (job id, signing secret) from the start response', async () => {
    const result = await experimental_startVideo({
      model: new MockVideoModelV4({
        doStart: async () =>
          createStartResponse({
            providerMetadata: {
              gateway: {
                asyncJob: {
                  jobId: 'job_123',
                  webhookSigningSecret: 'secret',
                },
              },
            },
          }),
      }),
      prompt,
    });

    expect(result.providerMetadata).toStrictEqual({
      gateway: {
        asyncJob: { jobId: 'job_123', webhookSigningSecret: 'secret' },
      },
    });
    expect(result.response).toStrictEqual({
      timestamp: testDate,
      modelId: 'test-model-id',
      headers: {},
    });
  });

  it('should combine input-normalization warnings with start warnings', async () => {
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const frameImage = {
      image: pngBase64,
      frameType: 'first_frame' as const,
    };

    const result = await experimental_startVideo({
      model: new MockVideoModelV4({
        doStart: async () =>
          createStartResponse({
            warnings: [{ type: 'other', message: 'queued' }],
          }),
      }),
      prompt: { image: pngBase64, text: prompt },
      frameImages: [frameImage],
      inputReferences: [pngBase64],
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'other',
        message:
          'inputReferences were ignored because frameImages were provided; ' +
          'frameImages and inputReferences cannot be combined.',
      },
      {
        type: 'other',
        message:
          'prompt.image was ignored because a first_frame frameImage was provided; ' +
          'the first_frame frameImage takes precedence as the start image.',
      },
      { type: 'other', message: 'queued' },
    ]);
  });

  it('should throw when n is not a positive integer', async () => {
    const doStart = vi.fn(async () => createStartResponse());
    const model = new MockVideoModelV4({ doStart });

    await expect(
      experimental_startVideo({ model, prompt, n: 0 }),
    ).rejects.toThrow('Invalid n: expected a positive integer, received 0.');
    await expect(
      experimental_startVideo({ model, prompt, n: 1.5 }),
    ).rejects.toThrow('Invalid n: expected a positive integer, received 1.5.');
    expect(doStart).not.toHaveBeenCalled();
  });

  it('should throw when n exceeds the known per-call limit', async () => {
    await expect(
      experimental_startVideo({
        model: new MockVideoModelV4({
          maxVideosPerCall: 2,
          doStart: async () => createStartResponse(),
        }),
        prompt,
        n: 3,
      }),
    ).rejects.toThrow(
      'supports at most 2 video(s) per call, but 3 were requested',
    );
  });

  it('should invoke a functional maxVideosPerCall', async () => {
    let calls = 0;

    await experimental_startVideo({
      model: new MockVideoModelV4({
        maxVideosPerCall: async () => {
          calls++;
          return 4;
        },
        doStart: async () => createStartResponse(),
      }),
      prompt,
      n: 4,
    });

    expect(calls).toBe(1);
  });

  it('should throw when the model does not implement doStart', async () => {
    await expect(
      experimental_startVideo({
        model: new MockVideoModelV4({}),
        prompt,
      }),
    ).rejects.toThrow('Video model mock-model-id does not implement doStart.');
  });
});

describe('experimental_getVideoStatus', () => {
  it('should call doStatus with the operation', async () => {
    let capturedOperation: unknown;

    const result = await experimental_getVideoStatus(
      new MockVideoModelV4({
        doStatus: async options => {
          capturedOperation = options.operation;
          return {
            status: 'pending' as const,
            response: {
              timestamp: testDate,
              modelId: 'test-model-id',
              headers: {},
            },
          };
        },
      }),
      { operation: { taskId: 'task-123' } },
    );

    expect(capturedOperation).toStrictEqual({ taskId: 'task-123' });
    expect(result.status).toBe('pending');
  });

  it('should return the completed payload with videos', async () => {
    const result = await experimental_getVideoStatus(
      new MockVideoModelV4({
        doStatus: async () => ({
          status: 'completed' as const,
          videos: [
            { type: 'base64' as const, data: 'AAAA', mediaType: 'video/mp4' },
          ],
          warnings: [],
          response: {
            timestamp: testDate,
            modelId: 'test-model-id',
            headers: {},
          },
        }),
      }),
      { operation: 'op-1' },
    );

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.videos).toHaveLength(1);
    }
  });

  it('should throw when the model does not implement doStatus', async () => {
    await expect(
      experimental_getVideoStatus(new MockVideoModelV4({}), {
        operation: 'op-1',
      }),
    ).rejects.toThrow('Video model mock-model-id does not implement doStatus.');
  });
});
