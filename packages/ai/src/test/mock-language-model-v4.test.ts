import { describe, it, expect } from 'vitest';
import { MockLanguageModelV4 } from './mock-language-model-v4';

const generateResult = (text: string) =>
  ({
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
    warnings: [],
  }) as any;

describe('MockLanguageModelV4', () => {
  describe('doGenerate array form', () => {
    it('should return entries in order starting from the first', async () => {
      const model = new MockLanguageModelV4({
        doGenerate: [generateResult('FIRST'), generateResult('SECOND')],
      });

      const r1 = await model.doGenerate({} as any);
      const r2 = await model.doGenerate({} as any);

      expect((r1.content[0] as { text: string }).text).toBe('FIRST');
      expect((r2.content[0] as { text: string }).text).toBe('SECOND');
    });
  });

  describe('doStream array form', () => {
    it('should return entries in order starting from the first', async () => {
      const model = new MockLanguageModelV4({
        doStream: [
          { stream: new ReadableStream(), request: { tag: 'first' } } as any,
          { stream: new ReadableStream(), request: { tag: 'second' } } as any,
        ],
      });

      const r1 = await model.doStream({} as any);
      const r2 = await model.doStream({} as any);

      expect((r1.request as { tag: string }).tag).toBe('first');
      expect((r2.request as { tag: string }).tag).toBe('second');
    });
  });
});
