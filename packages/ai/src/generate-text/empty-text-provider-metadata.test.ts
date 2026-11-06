import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { generateText, streamText } from '..';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

describe('public empty text response metadata preservation', () => {
  const cases = [
    { name: 'undefined metadata', metadata: undefined, retain: false },
    {
      name: 'null metadata from a JavaScript provider',
      metadata: null,
      retain: false,
    },
    { name: 'an empty metadata object', metadata: {}, retain: true },
    {
      name: 'opaque generic provider metadata',
      metadata: { custom: { opaque: 'preserve-exactly/+=' } },
      retain: true,
    },
  ];

  for (const api of ['streamText', 'generateText'] as const) {
    it.each(cases)(`${api}: $name`, async ({ metadata, retain }) => {
      // The cast covers a JavaScript provider returning a runtime null value.
      const providerMetadata = metadata as SharedV4ProviderMetadata | undefined;
      const content = [
        { type: 'text' as const, text: 'A' },
        { type: 'text' as const, text: '', providerMetadata },
        { type: 'text' as const, text: 'B' },
      ];
      const stream: LanguageModelV4StreamPart[] = [
        { type: 'text-start', id: 'a' },
        { type: 'text-delta', id: 'a', delta: 'A' },
        { type: 'text-end', id: 'a' },
        { type: 'text-start', id: 'empty', providerMetadata },
        { type: 'text-delta', id: 'empty', delta: '', providerMetadata },
        { type: 'text-end', id: 'empty' },
        { type: 'text-start', id: 'b' },
        { type: 'text-delta', id: 'b', delta: 'B' },
        { type: 'text-end', id: 'b' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'STOP' },
          usage,
        },
      ];
      const model = new MockLanguageModelV4({
        doGenerate: {
          content,
          finishReason: { unified: 'stop', raw: 'STOP' },
          usage,
          warnings: [],
        },
        doStream: { stream: convertArrayToReadableStream(stream) },
      });

      const result =
        api === 'streamText'
          ? streamText({ model, prompt: 'Metadata preservation' })
          : await generateText({ model, prompt: 'Metadata preservation' });
      if ('stream' in result) {
        for await (const event of result.stream) {
          expect(event.type).not.toBe('error');
        }
      }
      const step = await result.finalStep;
      const expected = [
        { type: 'text', text: 'A', providerOptions: undefined },
        ...(retain
          ? [{ type: 'text', text: '', providerOptions: metadata }]
          : []),
        { type: 'text', text: 'B', providerOptions: undefined },
      ];
      expect(step.response.messages).toEqual([
        { role: 'assistant', content: expected },
      ]);
      if (retain) {
        expect(step.content).toContainEqual({
          type: 'text',
          text: '',
          providerMetadata: metadata,
        });
      }
    });
  }
});
