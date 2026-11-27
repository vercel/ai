import { NoSuchModelError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createHume } from './hume-provider';

describe('createHume', () => {
  it('rejects unsupported model types', () => {
    const provider = createHume();
    expect(provider.specificationVersion).toBe('v4');
    expect(() => provider.languageModel('other')).toThrow(NoSuchModelError);
    expect(() => provider.embeddingModel('other')).toThrow(NoSuchModelError);
    expect(() => provider.imageModel('other')).toThrow(NoSuchModelError);
  });
});
