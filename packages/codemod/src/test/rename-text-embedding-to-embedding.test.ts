import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v6/rename-text-embedding-to-embedding';
import { applyTransform, testTransform } from './test-utils';

describe('rename-text-embedding-to-embedding', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'rename-text-embedding-to-embedding');
  });

  it.each([
    ['textEmbedding', 'embedding'],
    ['textEmbeddingModel', 'embeddingModel'],
  ])('renames %s passed as a call argument', (oldName, newName) => {
    const source = `identity(provider.${oldName})`;
    const output = applyTransform(transformer, source);
    const factory = () => ({ modelId: 'test' });

    expect(output).toBe(`identity(provider.${newName})`);
    expect(
      runInNewContext(output, {
        identity: (value: unknown) => value,
        provider: { [newName]: factory },
      }),
    ).toBe(factory);
    expect(applyTransform(transformer, output)).toBe(output);
  });
});
