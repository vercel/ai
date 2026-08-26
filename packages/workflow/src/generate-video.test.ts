import type {
  Experimental_VideoModelV4,
  Experimental_VideoModelV4VideoData,
} from '@ai-sdk/provider';
import { createWebhook, getStepMetadata } from 'workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { experimental_generateVideo } from './generate-video.js';

vi.mock('workflow', () => ({
  createWebhook: vi.fn(),
  getStepMetadata: vi.fn(() => ({ stepId: 'step-1' })),
}));

const response = {
  timestamp: new Date(0),
  modelId: 'test-model',
  headers: {},
};

function mockWebhook() {
  let resolve!: () => void;
  const dispose = vi.fn();
  const promise = new Promise<Request>(resolvePromise => {
    resolve = () =>
      resolvePromise(new Request('https://example.com/workflow-webhook'));
  });
  const webhook = Object.assign(promise, {
    url: 'https://example.com/workflow-webhook',
    [Symbol.dispose]: dispose,
  });

  vi.mocked(createWebhook).mockReturnValue(
    webhook as unknown as ReturnType<typeof createWebhook>,
  );

  return { dispose, resolve };
}

function createVideoModel({
  doStart,
  doStatus,
}: Pick<Experimental_VideoModelV4, 'doStart' | 'doStatus'>) {
  return {
    specificationVersion: 'v4' as const,
    provider: 'test-provider',
    modelId: 'test-model',
    maxVideosPerCall: 1,
    handleWebhookOption: async ({ webhook }) => {
      const result = await webhook();
      return { webhookUrl: result.url, received: result.received };
    },
    doStart,
    doStatus,
  } satisfies Experimental_VideoModelV4;
}

describe('experimental_generateVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStepMetadata).mockReturnValue({
      stepId: 'step-1',
    } as ReturnType<typeof getStepMetadata>);
  });

  it('waits for the webhook and returns provider video data unchanged', async () => {
    const { dispose, resolve } = mockWebhook();
    const videos: Experimental_VideoModelV4VideoData[] = [
      {
        type: 'url',
        url: 'https://example.com/video.mp4',
        mediaType: 'video/mp4',
      },
      {
        type: 'base64',
        data: 'YmFzZTY0',
        mediaType: 'video/mp4',
      },
      {
        type: 'binary',
        data: new Uint8Array([1, 2, 3]),
        mediaType: 'video/mp4',
      },
    ];
    const doStart = vi.fn(
      async (
        _options: Parameters<
          NonNullable<Experimental_VideoModelV4['doStart']>
        >[0],
      ) => ({
        operation: { id: 'operation-1' },
        warnings: [{ type: 'other' as const, message: 'start warning' }],
        response,
      }),
    );
    const doStatus = vi.fn(
      async (
        _options: Parameters<
          NonNullable<Experimental_VideoModelV4['doStatus']>
        >[0],
      ) => {
        expect(dispose).toHaveBeenCalledOnce();
        return {
          status: 'completed' as const,
          videos,
          warnings: [],
          response,
        };
      },
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const model = createVideoModel({ doStart, doStatus });

    const resultPromise = experimental_generateVideo({
      model,
      prompt: 'A lighthouse in fog',
      headers: { 'x-test': 'test' },
      maxRetries: 1,
    });

    await vi.waitFor(() => expect(doStart).toHaveBeenCalledOnce());
    expect(doStart.mock.calls[0][0].webhookUrl).toBe(
      'https://example.com/workflow-webhook',
    );
    expect(doStart.mock.calls[0][0].headers).toMatchObject({
      'idempotency-key': 'aisdk_workflow_video_step-1',
      'x-test': 'test',
    });
    expect(doStatus).not.toHaveBeenCalled();

    resolve();

    const result = await resultPromise;
    expect(doStatus).toHaveBeenCalledOnce();
    expect(doStatus.mock.calls[0][0].operation).toEqual({ id: 'operation-1' });
    expect(result.videos).toEqual(videos);
    expect(result.warnings).toEqual([
      { type: 'other', message: 'start warning' },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('throws when the provider reports an error', async () => {
    const { resolve } = mockWebhook();
    const model = createVideoModel({
      doStart: async () => ({
        operation: { id: 'operation-1' },
        warnings: [],
        response,
      }),
      doStatus: async () => ({
        status: 'error',
        error: 'Video generation failed',
        response,
      }),
    });

    const resultPromise = experimental_generateVideo({
      model,
      prompt: 'A lighthouse in fog',
    });
    resolve();

    await expect(resultPromise).rejects.toThrow('Video generation failed');
  });

  it('preserves a caller-provided idempotency key', async () => {
    const { resolve } = mockWebhook();
    const doStart = vi.fn(
      async (
        _options: Parameters<
          NonNullable<Experimental_VideoModelV4['doStart']>
        >[0],
      ) => ({
        operation: { id: 'operation-1' },
        warnings: [],
        response,
      }),
    );
    const model = createVideoModel({
      doStart,
      doStatus: async () => ({
        status: 'completed',
        videos: [],
        warnings: [],
        response,
      }),
    });

    const resultPromise = experimental_generateVideo({
      model,
      prompt: 'A lighthouse in fog',
      headers: { 'Idempotency-Key': 'custom-key' },
    });
    resolve();
    await resultPromise;

    expect(doStart.mock.calls[0][0].headers).toMatchObject({
      'idempotency-key': 'custom-key',
    });
    expect(getStepMetadata).not.toHaveBeenCalled();
  });

  it('throws when the video is pending after the webhook notification', async () => {
    const { resolve } = mockWebhook();
    const model = createVideoModel({
      doStart: async () => ({
        operation: { id: 'operation-1' },
        warnings: [],
        response,
      }),
      doStatus: async () => ({
        status: 'pending',
        response,
      }),
    });

    const resultPromise = experimental_generateVideo({
      model,
      prompt: 'A lighthouse in fog',
    });
    resolve();

    await expect(resultPromise).rejects.toThrow(
      'Video generation did not complete after webhook notification.',
    );
  });

  it('rejects provider models without native webhook support', async () => {
    const model: Experimental_VideoModelV4 = {
      specificationVersion: 'v4',
      provider: 'test-provider',
      modelId: 'test-model',
      maxVideosPerCall: 1,
      doStart: async () => ({
        operation: { id: 'operation-1' },
        warnings: [],
        response,
      }),
      doStatus: async () => ({
        status: 'pending',
        response,
      }),
    };

    await expect(
      experimental_generateVideo({
        model,
        prompt: 'A lighthouse in fog',
      }),
    ).rejects.toThrow(
      'Workflow video generation requires a model with native webhook support.',
    );
    expect(createWebhook).not.toHaveBeenCalled();
  });
});
