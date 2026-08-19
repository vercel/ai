import type {
  LanguageModelV2,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV2 } from './mock-language-model-v2';
import { MockLanguageModelV3 } from './mock-language-model-v3';

function generateResultV2(
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

function generateResultV3(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { raw: undefined, unified: 'stop' },
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 1,
        text: 1,
        reasoning: undefined,
      },
    },
    warnings: [],
  };
}

function streamResultV2(): Awaited<ReturnType<LanguageModelV2['doStream']>> {
  return { stream: new ReadableStream() };
}

function streamResultV3(): LanguageModelV3StreamResult {
  return { stream: new ReadableStream() };
}

describe('MockLanguageModelV2', () => {
  it('returns array-backed generate results in order from the first entry', async () => {
    const first = generateResultV2('first');
    const second = generateResultV2('second');
    const model = new MockLanguageModelV2({
      doGenerate: [first, second],
    });

    await expect(model.doGenerate({} as never)).resolves.toBe(first);
    await expect(model.doGenerate({} as never)).resolves.toBe(second);
  });

  it('returns array-backed stream results in order from the first entry', async () => {
    const first = streamResultV2();
    const second = streamResultV2();
    const model = new MockLanguageModelV2({
      doStream: [first, second],
    });

    await expect(model.doStream({} as never)).resolves.toBe(first);
    await expect(model.doStream({} as never)).resolves.toBe(second);
  });
});

describe('MockLanguageModelV3', () => {
  it('returns array-backed generate results in order from the first entry', async () => {
    const first = generateResultV3('first');
    const second = generateResultV3('second');
    const model = new MockLanguageModelV3({
      doGenerate: [first, second],
    });

    await expect(model.doGenerate({ prompt: [] })).resolves.toBe(first);
    await expect(model.doGenerate({ prompt: [] })).resolves.toBe(second);
  });

  it('returns array-backed stream results in order from the first entry', async () => {
    const first = streamResultV3();
    const second = streamResultV3();
    const model = new MockLanguageModelV3({
      doStream: [first, second],
    });

    await expect(model.doStream({ prompt: [] })).resolves.toBe(first);
    await expect(model.doStream({ prompt: [] })).resolves.toBe(second);
  });
});
