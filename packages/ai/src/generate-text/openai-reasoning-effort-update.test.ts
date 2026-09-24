import { createOpenAI } from '@ai-sdk/openai';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { generateText } from './generate-text';
import { streamText } from './stream-text';

describe.each(['generate', 'stream'] as const)(
  'OpenAI positioned reasoning effort through %sText',
  method => {
    const url = 'https://api.openai.com/v1/responses';
    const server = createTestServer({ [url]: {} });

    it('preserves empty system controls and their positions through core normalization', async () => {
      const response = {
        id: 'resp_test',
        created_at: 0,
        model: 'gpt-6-astra',
        output: [],
      };
      server.urls[url].response =
        method === 'generate'
          ? { type: 'json-value', body: response }
          : {
              type: 'stream-chunks',
              chunks: [
                `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
                'data: [DONE]\n\n',
              ],
            };
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
      const options = {
        model: createOpenAI({ apiKey: 'test-key' }).responses('gpt-6-astra'),
        allowSystemInMessages: true,
        reasoning: 'low' as const,
        messages,
      };

      if (method === 'generate') {
        await generateText(options);
      } else {
        const result = streamText(options);
        await result.consumeStream();
        await result.text;
      }

      expect(server.calls).toHaveLength(1);
      const body = await server.calls[0].requestBodyJson;
      expect(body.input).toEqual([
        { role: 'user', content: [{ type: 'input_text', text: 'First' }] },
        { role: 'assistant', content: 'Answer' },
        { type: 'configuration_update', reasoning: { effort: 'high' } },
        { role: 'user', content: [{ type: 'input_text', text: 'Second' }] },
        { role: 'assistant', content: 'Answer' },
        { type: 'configuration_update', reasoning: { effort: 'low' } },
        { role: 'user', content: [{ type: 'input_text', text: 'Third' }] },
      ]);
      expect(body.reasoning.effort).toBe('low');
      expect(body.stream).toBe(method === 'stream' ? true : undefined);
    });
  },
);
