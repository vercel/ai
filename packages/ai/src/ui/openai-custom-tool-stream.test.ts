import { createOpenAI } from '@ai-sdk/openai';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { streamText } from '../generate-text/stream-text';
import { readUIMessageStream } from '../ui-message-stream/read-ui-message-stream';
import { isToolUIPart } from './ui-messages';

describe.each(['text', 'grammar'] as const)(
  'OpenAI custom %s tool input streaming',
  format => {
    const url = 'https://api.openai.com/v1/responses';
    const server = createTestServer({ [url]: {} });

    it.each([
      { name: 'HTML', deltas: ['<main>', '<h1>Streaming</h1></main>'] },
      { name: 'SQL', deltas: ['SELECT * ', 'FROM users'] },
      { name: 'null', deltas: ['nu', 'll'] },
      { name: 'boolean', deltas: ['fa', 'lse'] },
      { name: 'number', deltas: ['12', '3'] },
      { name: 'object', deltas: ['{"x":', '1}'] },
      { name: 'array', deltas: ['[1,', '2]'] },
      { name: 'quoted string', deltas: ['"hello', ' world"'] },
      { name: 'null prefix', deltas: ['null', ' byte'] },
      { name: 'number prefix', deltas: ['123', ' apples'] },
      { name: 'escapes', deltas: ['quote: "', '\\path\n\t\r\u0000'] },
      { name: 'split surrogate pair', deltas: ['\ud83d', '\ude00'] },
      { name: 'whitespace', deltas: [' ', '\n\t'] },
      { name: 'empty input', deltas: ['', ''] },
      { name: 'no deltas', deltas: [] },
    ])(
      'preserves $name as a string in every delta snapshot',
      async ({ deltas }) => {
        const input = deltas.join('');
        const item = {
          type: 'custom_tool_call',
          id: 'ctc_test',
          call_id: 'call_test',
          name: 'setText',
          input: '',
        };
        server.urls[url].response = {
          type: 'stream-chunks',
          chunks: [
            { type: 'response.output_item.added', output_index: 0, item },
            ...deltas.map(delta => ({
              type: 'response.custom_tool_call_input.delta',
              output_index: 0,
              item_id: item.id,
              delta,
            })),
            {
              type: 'response.output_item.done',
              output_index: 0,
              item: { ...item, input, status: 'completed' },
            },
            { type: 'response.completed', response: {} },
          ].map(event => `data: ${JSON.stringify(event)}\n\n`),
        };

        const openai = createOpenAI({ apiKey: 'test-key' });
        const result = streamText({
          model: openai.responses('gpt-5.2-codex'),
          prompt: 'Return the requested text verbatim.',
          tools: {
            setText: openai.tools.customTool({
              format:
                format === 'text'
                  ? { type: 'text' }
                  : { type: 'grammar', syntax: 'regex', definition: '.*' },
            }),
          },
        });

        const streamingInputs: unknown[] = [];
        const completeInputs: unknown[] = [];
        for await (const message of readUIMessageStream({
          stream: result.toUIMessageStream(),
          terminateOnError: true,
        })) {
          const part = message.parts.find(isToolUIPart);
          if (part?.state === 'input-streaming') {
            streamingInputs.push(part.input);
          } else if (part?.state === 'input-available') {
            completeInputs.push(part.input);
          }
        }

        const prefixes = deltas.map((_, index) =>
          deltas.slice(0, index + 1).join(''),
        );
        expect(streamingInputs).toEqual([undefined, '', ...prefixes, input]);
        expect(completeInputs.length).toBeGreaterThan(0);
        expect(completeInputs.every(value => value === input)).toBe(true);
        expect((await result.toolCalls)[0].input).toBe(input);
      },
    );
  },
);
