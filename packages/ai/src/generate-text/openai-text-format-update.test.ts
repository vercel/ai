import {
  createOpenAI,
  type OpenAIResponsesSystemMessageOptions,
} from '@ai-sdk/openai';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { generateText } from './generate-text';
import { streamText } from './stream-text';
import * as Output from './output';

const url = 'https://api.openai.com/v1/responses';
const schema = z.object({ total: z.number() });
const format = {
  type: 'json_schema' as const,
  name: 'crate_count',
  strict: true,
  schema: {
    type: 'object',
    properties: { total: { type: 'number' } },
    required: ['total'],
    additionalProperties: false,
  },
};

describe.each(['generate', 'stream'] as const)(
  'OpenAI format updates through %sText',
  method => {
    const server = createTestServer({ [url]: {} });

    it.each([false, true])(
      'preserves controls, validates Output, and replays history (store: %s)',
      async store => {
        server.urls[url].response = ({ callNumber }) => {
          const item = {
            id: `msg_${callNumber}`,
            type: 'message',
            role: 'assistant',
            phase: 'final_answer',
            content: [
              {
                type: 'output_text',
                text:
                  callNumber === 1 ? '{"total":43}' : 'There are 43 crates.',
                annotations: [],
              },
            ],
          };
          const response = {
            id: `resp_${callNumber}`,
            created_at: 0,
            model: 'gpt-6-astra',
            output: [item],
            usage: { input_tokens: 20, output_tokens: 10 },
            prompt_cache_diagnostics: { type: 'cache_hit' },
          };
          return method === 'generate'
            ? { type: 'json-value', body: response }
            : {
                type: 'stream-chunks',
                chunks: [
                  { type: 'response.created', response },
                  { type: 'response.output_item.added', output_index: 0, item },
                  {
                    type: 'response.output_text.delta',
                    item_id: item.id,
                    output_index: 0,
                    content_index: 0,
                    delta: item.content[0].text,
                  },
                  { type: 'response.output_item.done', output_index: 0, item },
                  { type: 'response.completed', response },
                ].map(event => `data: ${JSON.stringify(event)}\n\n`),
              };
        };
        const messages: ModelMessage[] = [
          { role: 'user', content: 'There are 17 red and 26 blue crates.' },
        ];
        const common = {
          model: createOpenAI({ apiKey: 'test' }).responses('gpt-6-astra'),
          allowSystemInMessages: true,
          messages,
          providerOptions: {
            openai: { store, textFormat: { type: 'text' as const } },
          },
          maxRetries: 0,
        };
        const first =
          method === 'generate'
            ? await generateText(common)
            : streamText(common);
        if (method === 'stream')
          await (first as ReturnType<typeof streamText>).consumeStream();
        messages.push(
          ...(await first.response).messages,
          {
            role: 'system',
            content: '',
            providerOptions: {
              openai: {
                textFormatUpdate: format,
              } satisfies OpenAIResponsesSystemMessageOptions,
            },
          },
          { role: 'user', content: 'Count all the crates.' },
        );
        const settings = {
          ...common,
          experimental_output: Output.object({ schema }),
          providerOptions: {
            openai: {
              ...common.providerOptions.openai,
              promptCacheOptions: {
                comparisonResponseId: (await first.response).id!,
              },
            },
          },
        };
        const second =
          method === 'generate'
            ? await generateText(settings)
            : streamText(settings);
        let output;
        if (method === 'stream') {
          for await (const partial of (second as ReturnType<typeof streamText>)
            .experimental_partialOutputStream)
            output = partial;
        } else {
          output = (second as Awaited<ReturnType<typeof generateText>>)
            .experimental_output;
        }
        expect(output).toEqual({ total: 43 });
        expect(
          (await second.providerMetadata)?.openai?.promptCacheDiagnostics,
        ).toEqual({ type: 'cache_hit' });
        messages.push(
          ...(await second.response).messages,
          {
            role: 'system',
            content: '',
            providerOptions: { openai: { textFormatUpdate: { type: 'text' } } },
          },
          { role: 'user', content: 'Say it in plain text.' },
        );
        const third =
          method === 'generate'
            ? await generateText(common)
            : streamText(common);
        if (method === 'stream')
          await (third as ReturnType<typeof streamText>).consumeStream();
        expect(await third.text).toBe('There are 43 crates.');
        const bodies = await Promise.all(
          server.calls.map(call => call.requestBodyJson),
        );
        expect(bodies.map(body => body.text.format)).toEqual([
          { type: 'text' },
          { type: 'text' },
          { type: 'text' },
        ]);
        expect(bodies[1].input[2]).toEqual({
          type: 'configuration_update',
          text: { format },
        });
        expect(bodies[2].input.slice(0, bodies[1].input.length)).toEqual(
          bodies[1].input,
        );
        expect(bodies[2].input[5]).toEqual({
          type: 'configuration_update',
          text: { format: { type: 'text' } },
        });
        expect(bodies[1].prompt_cache_options).toEqual({
          comparison_response_id: 'resp_0',
        });
      },
    );
  },
);
