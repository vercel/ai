import { describe, expect, it } from 'vitest';
import { MockEmbeddingModelV3 } from './mock-embedding-model-v3';
import { MockEmbeddingModelV4 } from './mock-embedding-model-v4';
import { MockLanguageModelV3 } from './mock-language-model-v3';
import { MockLanguageModelV4 } from './mock-language-model-v4';

describe('mock model array indexing', () => {
  it('returns array entries in call order for MockLanguageModelV3', async () => {
    const generateResult1 = { text: 'generate-1' } as any;
    const generateResult2 = { text: 'generate-2' } as any;
    const streamResult1 = { stream: 'stream-1' } as any;
    const streamResult2 = { stream: 'stream-2' } as any;
    const model = new MockLanguageModelV3({
      doGenerate: [generateResult1, generateResult2],
      doStream: [streamResult1, streamResult2],
    });

    expect(await model.doGenerate({} as any)).toBe(generateResult1);
    expect(await model.doGenerate({} as any)).toBe(generateResult2);
    expect(await model.doStream({} as any)).toBe(streamResult1);
    expect(await model.doStream({} as any)).toBe(streamResult2);
  });

  it('returns array entries in call order for MockLanguageModelV4', async () => {
    const generateResult1 = { text: 'generate-1' } as any;
    const generateResult2 = { text: 'generate-2' } as any;
    const streamResult1 = { stream: 'stream-1' } as any;
    const streamResult2 = { stream: 'stream-2' } as any;
    const model = new MockLanguageModelV4({
      doGenerate: [generateResult1, generateResult2],
      doStream: [streamResult1, streamResult2],
    });

    expect(await model.doGenerate({} as any)).toBe(generateResult1);
    expect(await model.doGenerate({} as any)).toBe(generateResult2);
    expect(await model.doStream({} as any)).toBe(streamResult1);
    expect(await model.doStream({} as any)).toBe(streamResult2);
  });

  it('returns array entries in call order for MockEmbeddingModelV3', async () => {
    const embedResult1 = { embeddings: [[1]], usage: { tokens: 1 } } as any;
    const embedResult2 = { embeddings: [[2]], usage: { tokens: 2 } } as any;
    const model = new MockEmbeddingModelV3({
      doEmbed: [embedResult1, embedResult2],
    });

    expect(await model.doEmbed({} as any)).toBe(embedResult1);
    expect(await model.doEmbed({} as any)).toBe(embedResult2);
  });

  it('returns array entries in call order for MockEmbeddingModelV4', async () => {
    const embedResult1 = { embeddings: [[1]], usage: { tokens: 1 } } as any;
    const embedResult2 = { embeddings: [[2]], usage: { tokens: 2 } } as any;
    const model = new MockEmbeddingModelV4({
      doEmbed: [embedResult1, embedResult2],
    });

    expect(await model.doEmbed({} as any)).toBe(embedResult1);
    expect(await model.doEmbed({} as any)).toBe(embedResult2);
  });
});
