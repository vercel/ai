import type { ModelMessage } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { generateText } from './generate-text';
import { streamText } from './stream-text';

const dummyResponseValues = {
  finishReason: 'stop' as const,
  usage: {
    inputTokens: 3,
    outputTokens: 10,
    totalTokens: 13,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  },
  warnings: [],
};

describe.each(['generate', 'stream'] as const)(
  'OpenAI positioned reasoning effort through %sText',
  method => {
    it('preserves empty system controls and their positions through core normalization', async () => {
      const messages: ModelMessage[] = [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Answer' },
        {
          role: 'system',
          content: '',
          providerOptions: { openai: { reasoningEffortUpdate: 'high' } },
        },
        { role: 'user', content: 'Second' },
        { role: 'assistant', content: 'Answer' },
        {
          role: 'system',
          content: '',
          providerOptions: { openai: { reasoningEffortUpdate: 'low' } },
        },
        { role: 'user', content: 'Third' },
      ];
      const model = new MockLanguageModelV2({
        doGenerate: { content: [], ...dummyResponseValues },
        doStream: {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            {
              type: 'finish',
              finishReason: dummyResponseValues.finishReason,
              usage: dummyResponseValues.usage,
            },
          ]),
        },
      });
      const options = {
        model,
        allowSystemInMessages: true,
        providerOptions: { openai: { reasoningEffort: 'low' } },
        messages,
      };
      if (method === 'generate') {
        await generateText(options);
      } else {
        const result = streamText(options);
        await result.consumeStream();
        await result.text;
      }
      const calls =
        method === 'generate' ? model.doGenerateCalls : model.doStreamCalls;
      expect(calls).toHaveLength(1);
      expect(calls[0].prompt).toEqual(
        messages.map(message => ({
          ...message,
          content:
            message.role === 'system'
              ? message.content
              : [{ type: 'text', text: message.content }],
        })),
      );
      expect(calls[0].providerOptions).toEqual(options.providerOptions);
    });
  },
);
