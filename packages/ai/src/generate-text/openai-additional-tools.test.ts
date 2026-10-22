import { createOpenAI } from '@ai-sdk/openai';
import { tool, type ModelMessage } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { generateText } from './generate-text';
import { streamText } from './stream-text';
import { isStepCount } from './stop-condition';

describe.each(['generate', 'stream'] as const)(
  'OpenAI additional tools through %sText',
  method => {
    const url = 'https://api.openai.com/v1/responses';
    const server = createTestServer({ [url]: {} });

    it.each([false, true])(
      'executes history-loaded tools through automatic steps and manual replay (store: %s)',
      async store => {
        const definition = {
          type: 'function',
          name: 'list_issues',
          parameters: {
            type: 'object',
            properties: { team: { type: 'string' } },
            required: ['team'],
            additionalProperties: false,
          },
          strict: true,
        };
        const searchResult = [
          { connection: 'linear', tool: 'list_issues' },
          { connection: 'github', error: 'Not authorized' },
        ];
        const messages: ModelMessage[] = [
          { role: 'user', content: 'Find Linear and list issues for SDK.' },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'search',
                toolCallId: 'search-call',
                input: {},
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolName: 'search',
                toolCallId: 'search-call',
                output: { type: 'json', value: searchResult },
                providerOptions: { openai: { additionalTools: [definition] } },
              },
            ],
          },
        ];
        const execute = vi.fn(async ({ team }: { team: string }) => ({
          team,
          issues: ['SDK-1'],
        }));
        server.urls[url].response = ({ callNumber }) => {
          // Each invocation makes a tool call followed by a final completion.
          // The last invocation deliberately returns invalid arguments.
          const item = {
            type: 'function_call',
            id: `fc_${callNumber}`,
            call_id: `call_${callNumber}`,
            name: 'list_issues',
            arguments: JSON.stringify({ team: callNumber === 4 ? 123 : 'SDK' }),
            status: 'completed',
          };
          const callsTool = callNumber % 2 === 0;
          const response = {
            id: `resp_${callNumber}`,
            created_at: 0,
            model: 'gpt-5.4',
            output: callsTool ? [item] : [],
            usage: { input_tokens: 10, output_tokens: 5 },
          };
          return method === 'generate'
            ? { type: 'json-value', body: response }
            : {
                type: 'stream-chunks',
                chunks: [
                  ...(callsTool
                    ? [
                        {
                          type: 'response.output_item.added',
                          output_index: 0,
                          item: { ...item, arguments: '' },
                        },
                        {
                          type: 'response.output_item.done',
                          output_index: 0,
                          item,
                        },
                      ]
                    : []),
                  { type: 'response.completed', response },
                ].map(event => `data: ${JSON.stringify(event)}\n\n`),
              };
        };

        const options = {
          model: createOpenAI({ apiKey: 'test' }).responses('gpt-5.4'),
          tools: {
            search: tool({ inputSchema: z.object({}) }),
            list_issues: tool({
              inputSchema: z.object({ team: z.string() }),
              execute,
              providerOptions: { openai: { omitFromRequestTools: true } },
            }),
          },
          providerOptions: { openai: { store } },
          maxRetries: 0,
        };
        const invoke = async (steps: number) => {
          const settings = {
            ...options,
            messages,
            stopWhen: isStepCount(steps),
          };
          if (method === 'generate') return generateText(settings);
          const result = streamText(settings);
          await result.consumeStream();
          return {
            steps: await result.steps,
            responseMessages: await result.responseMessages,
          };
        };

        const first = await invoke(2);
        expect(first.steps).toHaveLength(2);
        expect(first.steps[0].toolResults[0].output).toEqual({
          team: 'SDK',
          issues: ['SDK-1'],
        });
        messages.push(...first.responseMessages, {
          role: 'user',
          content: 'List issues again.',
        });
        const second = await invoke(2);
        expect(second.steps[0].toolResults[0].output).toEqual({
          team: 'SDK',
          issues: ['SDK-1'],
        });
        expect(execute).toHaveBeenCalledTimes(2);

        const bodies = await Promise.all(
          server.calls.map(call => call.requestBodyJson),
        );
        expect(bodies).toHaveLength(4);
        const prefix = [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Find Linear and list issues for SDK.',
              },
            ],
          },
          {
            type: 'function_call',
            call_id: 'search-call',
            name: 'search',
            arguments: '{}',
          },
          {
            type: 'function_call_output',
            call_id: 'search-call',
            output: JSON.stringify(searchResult),
          },
          { type: 'additional_tools', role: 'developer', tools: [definition] },
        ];
        for (const body of bodies) {
          expect(body.input.slice(0, 4)).toEqual(prefix);
          expect(
            body.input.filter(
              (item: { type: string }) => item.type === 'additional_tools',
            ),
          ).toHaveLength(1);
          expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual(
            ['search'],
          );
        }
        expect(bodies[2].input).toEqual([
          ...bodies[1].input,
          {
            role: 'user',
            content: [{ type: 'input_text', text: 'List issues again.' }],
          },
        ]);
        expect(bodies[1].input.at(-1)).toEqual({
          type: 'function_call_output',
          call_id: 'call_0',
          output: JSON.stringify({ team: 'SDK', issues: ['SDK-1'] }),
        });
        expect(bodies[3].input.at(-1)).toEqual({
          type: 'function_call_output',
          call_id: 'call_2',
          output: JSON.stringify({ team: 'SDK', issues: ['SDK-1'] }),
        });

        // Omission is only about serialization: normal input validation still runs.
        messages.push(...second.responseMessages, {
          role: 'user',
          content: 'Try again.',
        });
        const invalid = await invoke(1);
        expect(invalid.steps[0].toolCalls[0]).toMatchObject({
          toolName: 'list_issues',
          invalid: true,
        });
        expect(execute).toHaveBeenCalledTimes(2);
      },
    );
  },
);
