import type { LanguageModelV2 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV2 } from './mock-language-model-v2';

function generateResult(
  text: string,
): Awaited<ReturnType<LanguageModelV2['doGenerate']>> {
  return {
    content: [{ type: 'text', text }],
    finishReason: 'stop',
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
    },
    warnings: [],
  };
}

function streamResult(): Awaited<ReturnType<LanguageModelV2['doStream']>> {
  return { stream: new ReadableStream() };
}

describe('MockLanguageModelV2', () => {
  it('returns array-backed generate results in order from the first entry', async () => {
    const first = generateResult('first');
    const second = generateResult('second');
    const model = new MockLanguageModelV2({
      doGenerate: [first, second],
    });

    await expect(model.doGenerate({} as never)).resolves.toBe(first);
    await expect(model.doGenerate({} as never)).resolves.toBe(second);
  });

  it('returns array-backed stream results in order from the first entry', async () => {
    const first = streamResult();
    const second = streamResult();
    const model = new MockLanguageModelV2({
      doStream: [first, second],
    });

    await expect(model.doStream({} as never)).resolves.toBe(first);
    await expect(model.doStream({} as never)).resolves.toBe(second);
  });
});
