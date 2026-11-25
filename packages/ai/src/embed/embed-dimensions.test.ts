import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { MockEmbeddingModelV4 } from '../test/mock-embedding-model-v4';
import { embed } from './embed';
import { embedMany } from './embed-many';

type Options = Omit<Parameters<typeof embed>[0], 'value'>;

describe.each([
  {
    name: 'embed',
    run: (options: Options) => embed({ ...options, value: 'one' }),
    modelOptions: {},
    expectedValues: [['one']],
  },
  {
    name: 'embedMany without chunking',
    run: (options: Options) =>
      embedMany({ ...options, values: ['one', 'two', 'three'] }),
    modelOptions: { maxEmbeddingsPerCall: Infinity },
    expectedValues: [['one', 'two', 'three']],
  },
  {
    name: 'embedMany with sequential chunks',
    run: (options: Options) =>
      embedMany({ ...options, values: ['one', 'two', 'three'] }),
    modelOptions: { maxEmbeddingsPerCall: 2, supportsParallelCalls: false },
    expectedValues: [['one', 'two'], ['three']],
  },
  {
    name: 'embedMany with parallel chunks',
    run: (options: Options) =>
      embedMany({ ...options, values: ['one', 'two', 'three'] }),
    modelOptions: { maxEmbeddingsPerCall: 2, supportsParallelCalls: true },
    expectedValues: [['one', 'two'], ['three']],
  },
  {
    name: 'embedMany with input byte chunks',
    run: (options: Options) =>
      embedMany({ ...options, values: ['one', 'two', 'three'] }),
    modelOptions: {
      maxEmbeddingsPerCall: Infinity,
      maxInputBytesPerCall: 6,
    },
    expectedValues: [['one', 'two'], ['three']],
  },
])('$name dimensions', ({ run, modelOptions, expectedValues }) => {
  function createModel() {
    return new MockEmbeddingModelV4({
      ...modelOptions,
      doEmbed: async ({ values }) => ({
        embeddings: values.map(() => [0.1, 0.2, 0.3]),
        warnings: [],
      }),
    });
  }

  it('forwards dimensions and leaves provider options unchanged', async () => {
    const model = createModel();
    const providerOptions = { test: { dimensions: 2 } };
    const onStart = vi.fn();
    const onTelemetryStart = vi.fn();
    const onEmbedStart = vi.fn();

    await run({
      model,
      dimensions: 3,
      providerOptions,
      onStart,
      telemetry: {
        integrations: { onStart: onTelemetryStart, onEmbedStart },
      },
    });

    expect(model.doEmbedCalls.map(call => call.values)).toEqual(expectedValues);
    for (const call of model.doEmbedCalls) {
      expect(call.dimensions).toBe(3);
      expect(call.providerOptions).toEqual(providerOptions);
    }
    expect(onStart).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ dimensions: 3 }),
    );
    expect(onTelemetryStart).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ dimensions: 3 }),
    );
    expect(onEmbedStart).toHaveBeenCalledTimes(expectedValues.length);
    for (const [event] of onEmbedStart.mock.calls) {
      expect(event.dimensions).toBe(3);
    }
  });

  it('leaves dimensions unspecified when omitted', async () => {
    const model = createModel();

    await run({ model });

    expect(model.doEmbedCalls.map(call => call.values)).toEqual(expectedValues);
    for (const call of model.doEmbedCalls) {
      expect(call.dimensions).toBeUndefined();
    }
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity])(
    'rejects invalid dimensions %s before calling the model',
    async dimensions => {
      const model = createModel();
      const result = run({ model, dimensions });

      await expect(result).rejects.toSatisfy(InvalidArgumentError.isInstance);
      await expect(result).rejects.toMatchObject({
        parameter: 'dimensions',
        value: dimensions,
      });
      expect(model.doEmbedCalls).toHaveLength(0);
    },
  );

  it('preserves dimensions when retrying a model call', async () => {
    const model = createModel();
    const doEmbed = model.doEmbed;
    let attempts = 0;
    model.doEmbed = async options => {
      expect(options.dimensions).toBe(3);
      if (attempts++ === 0) {
        throw new APICallError({
          message: 'Retry this request',
          url: 'https://example.com/embeddings',
          requestBodyValues: {},
          statusCode: 429,
          responseHeaders: { 'retry-after-ms': '0' },
          isRetryable: true,
        });
      }
      return doEmbed(options);
    };

    await run({ model, dimensions: 3, maxRetries: 1 });

    expect(attempts).toBe(expectedValues.length + 1);
  });
});
