import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { serializeModelOptions } from './serialize-model-options';
import { SerializationError } from './serialization-error';

describe('serializeModelOptions', () => {
  it('throws when headers is a cross-realm Promise', () => {
    const headers = runInNewContext(
      'Promise.resolve({ "x-api-key": "sk-test" })',
    ) as PromiseLike<Record<string, string | undefined>>;

    expect(() =>
      serializeModelOptions({
        modelId: 'model',
        config: {
          provider: 'test',
          headers,
        },
      }),
    ).toThrow(SerializationError);
  });

  it('throws when headers is a function returning a cross-realm Promise', () => {
    const headers = runInNewContext(
      'Promise.resolve({ "x-api-key": "sk-test" })',
    ) as PromiseLike<Record<string, string | undefined>>;

    expect(() =>
      serializeModelOptions({
        modelId: 'model',
        config: {
          provider: 'test',
          headers: () => headers,
        },
      }),
    ).toThrow(SerializationError);
  });
});
