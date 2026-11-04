import { beforeEach, describe, expect, it, vi } from 'vitest';
import { devToolsMiddleware } from './middleware.js';

const mockCreateRun = vi.fn();
const mockCreateStep = vi.fn();
const mockUpdateStepResult = vi.fn();

vi.mock('./db.js', () => ({
  createRun: (...args: unknown[]) => mockCreateRun(...args),
  createStep: (...args: unknown[]) => mockCreateStep(...args),
  updateStepResult: (...args: unknown[]) => mockUpdateStepResult(...args),
  notifyServerAsync: vi.fn(),
}));

describe('devToolsMiddleware media capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'crypto',
      Object.assign({}, crypto, {
        randomUUID: () => '00000000-0000-0000-0000-000000000000',
      }),
    );
  });

  it('normalizes binary values without bypassing provider toJSON behavior', async () => {
    class RedactedProviderOptions {
      secret = 'token';

      toJSON() {
        return { redacted: true };
      }
    }

    const middleware = devToolsMiddleware();
    await (middleware.wrapGenerate as any)({
      doGenerate: async () =>
        ({
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: new Uint8Array([137, 80, 78, 71]),
            },
          ],
          finishReason: { unified: 'stop', raw: undefined },
          usage: { inputTokens: 1, outputTokens: 1 },
          warnings: [],
          request: {
            body: { binary: new Uint8Array([1, 2]) },
          },
          response: {
            body: { binary: new Uint8Array([3, 4]) },
          },
        }) as any,
      model: {
        modelId: 'test-model',
        config: { provider: 'test-provider' },
      } as any,
      params: {
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: new Uint8Array([137, 80, 78, 71]),
              },
            ],
          },
        ],
        providerOptions: {
          test: new RedactedProviderOptions(),
        },
      } as any,
    });

    expect(JSON.parse(mockCreateStep.mock.calls[0][0].input)).toMatchObject({
      prompt: [
        {
          content: [
            {
              data: 'iVBORw==',
            },
          ],
        },
      ],
    });
    expect(
      JSON.parse(mockCreateStep.mock.calls[0][0].provider_options),
    ).toEqual({
      test: { redacted: true },
    });
    expect(
      JSON.parse(mockUpdateStepResult.mock.calls[0][1].output),
    ).toMatchObject({
      content: [
        {
          data: 'iVBORw==',
        },
      ],
    });
    expect(
      JSON.parse(mockUpdateStepResult.mock.calls[0][1].raw_request),
    ).toEqual({
      binary: { 0: 1, 1: 2 },
    });
    expect(
      JSON.parse(mockUpdateStepResult.mock.calls[0][1].raw_response),
    ).toEqual({
      binary: { 0: 3, 1: 4 },
    });
  });
});
