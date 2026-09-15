import {
  createOpenAI,
  type OpenAIResponsesToolResultOptions,
} from '@ai-sdk/openai';
import { jsonSchema, type ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { generateText } from './generate-text';
import { streamText } from './stream-text';
import { isStepCount } from './stop-condition';

const parameters = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;
const activation = {
  additionalTools: [{ type: 'function', name: 'specialist', parameters }],
} satisfies OpenAIResponsesToolResultOptions;

// Application-owned projection from a successful, durable result, not mutable
// execution state. The same projection is applied after loading saved messages.
function project(messages: ModelMessage[]): ModelMessage[] {
  return messages.map(message =>
    message.role !== 'tool'
      ? message
      : {
          ...message,
          content: message.content.map(part =>
            part.type === 'tool-result' &&
            part.toolName === 'readSkill' &&
            part.output.type === 'text' &&
            part.output.value === 'loaded'
              ? {
                  ...part,
                  providerOptions: {
                    ...part.providerOptions,
                    openai: { ...part.providerOptions?.openai, ...activation },
                  },
                }
              : part,
          ),
        },
  );
}

function isLoaded(messages: ModelMessage[]) {
  return messages.some(
    message =>
      message.role === 'tool' &&
      message.content.some(
        part =>
          part.type === 'tool-result' &&
          part.toolName === 'readSkill' &&
          part.output.type === 'text' &&
          part.output.value === 'loaded',
      ),
  );
}

describe.each(['generate', 'stream'] as const)(
  'OpenAI additional tools with %sText',
  mode => {
    function setup(script: string[][]) {
      const requests: Array<{
        input: Array<Record<string, unknown>>;
        tools: Array<{ name: string }>;
        tool_choice: unknown;
      }> = [];
      const specialist = vi.fn(async () => 'specialist result');
      const readSkill = vi.fn(async () => 'loaded');
      const model = createOpenAI({
        apiKey: 'test',
        fetch: async (_url, init) => {
          const request = JSON.parse(String(init?.body));
          requests.push(request);
          const names = script.shift();
          if (!names) throw new Error('Unexpected model request');
          const output = names.map((name, index) => ({
            type: 'function_call',
            id: `fc_${requests.length}_${index}`,
            call_id: `call_${requests.length}_${index}`,
            name,
            arguments: '{}',
            status: 'completed',
          }));
          const response = {
            id: 'resp_test',
            created_at: 0,
            model: 'gpt-5.4',
            output,
            usage: { input_tokens: 1, output_tokens: 1 },
          };
          if (!request.stream) return Response.json(response);
          const events: unknown[] = [{ type: 'response.created', response }];
          for (const [output_index, item] of output.entries()) {
            events.push(
              {
                type: 'response.output_item.added',
                output_index,
                item: { ...item, arguments: '' },
              },
              {
                type: 'response.function_call_arguments.delta',
                output_index,
                item_id: item.id,
                delta: '{}',
              },
              { type: 'response.output_item.done', output_index, item },
            );
          }
          events.push({ type: 'response.completed', response });
          return new Response(
            events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
            { headers: { 'content-type': 'text/event-stream' } },
          );
        },
      }).responses('gpt-5.4');
      const tools = {
        readSkill: {
          inputSchema: jsonSchema<Record<string, never>>(parameters),
          execute: readSkill,
        },
        specialist: {
          inputSchema: jsonSchema<Record<string, never>>(parameters),
          execute: specialist,
        },
      };
      async function run(
        messages: ModelMessage[],
        maxSteps = 3,
        toolChoice:
          | 'auto'
          | 'none'
          | 'required'
          | { type: 'tool'; toolName: 'specialist' } = 'auto',
      ) {
        const options = {
          model,
          tools,
          toolChoice,
          messages,
          maxRetries: 0,
          stopWhen: isStepCount(maxSteps),
          providerOptions: { openai: { store: false } },
          prepareStep: ({ messages }: { messages: ModelMessage[] }) => ({
            messages: project(messages),
            activeTools: isLoaded(messages)
              ? (['readSkill', 'specialist'] as Array<keyof typeof tools>)
              : (['readSkill'] as Array<keyof typeof tools>),
          }),
        };
        if (mode === 'generate')
          return (await generateText(options)).responseMessages;
        const result = streamText(options);
        await result.consumeStream({
          onError: error => {
            throw error;
          },
        });
        return await result.responseMessages;
      }
      return { requests, specialist, readSkill, run };
    }

    it('executes on the next step, saves/reloads a multi-step response, and replays the original position', async () => {
      const test = setup([
        ['readSkill'],
        ['specialist'],
        [],
        ['specialist'],
        [],
      ]);
      const initial: ModelMessage[] = [
        { role: 'user', content: 'Load the skill and use it.' },
      ];
      const response = await test.run(initial);
      const saved: ModelMessage[] = JSON.parse(
        JSON.stringify([...initial, ...project(response)]),
      );
      await test.run([...saved, { role: 'user', content: 'Use it again.' }]);
      expect(test.specialist).toHaveBeenCalledTimes(2);
      expect(test.readSkill).toHaveBeenCalledTimes(1);
      for (const request of test.requests)
        expect(request.tools.map(tool => tool.name)).toEqual(['readSkill']);
      expect(
        test.requests[0].input.some(item => item.type === 'additional_tools'),
      ).toBe(false);
      const second = test.requests[1].input;
      const index = second.findIndex(item => item.type === 'additional_tools');
      expect(second[index - 1]).toMatchObject({
        type: 'function_call_output',
        output: 'loaded',
      });
      expect(test.requests[3].input.slice(0, index + 1)).toEqual(
        second.slice(0, index + 1),
      );
      expect(
        test.requests[3].input.filter(item => item.type === 'additional_tools'),
      ).toHaveLength(1);
    });

    it.each(['auto', 'none', 'required', 'specialist'] as const)(
      'preserves %s tool choice after omitting the loaded declaration',
      async choice => {
        const test = setup([
          choice === 'required' || choice === 'specialist'
            ? ['specialist']
            : [],
        ]);
        await test.run(
          [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'read',
                  toolName: 'readSkill',
                  input: {},
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'read',
                  toolName: 'readSkill',
                  output: { type: 'text', value: 'loaded' },
                },
              ],
            },
          ],
          1,
          choice === 'specialist'
            ? { type: 'tool', toolName: 'specialist' }
            : choice,
        );
        expect(test.requests[0].tools.map(tool => tool.name)).toEqual([
          'readSkill',
        ]);
        expect(test.requests[0].tool_choice).toEqual(
          choice === 'specialist'
            ? { type: 'function', name: 'specialist' }
            : choice,
        );
      },
    );

    it.each([['specialist'], ['readSkill', 'specialist']])(
      'does not execute an unavailable call in %j',
      async (...names) => {
        const test = setup([names]);
        await test.run(
          [
            {
              role: 'user',
              content: 'Try calling the unavailable specialist.',
            },
          ],
          1,
        );
        expect(test.specialist).not.toHaveBeenCalled();
        expect(test.readSkill).toHaveBeenCalledTimes(
          names.includes('readSkill') ? 1 : 0,
        );
      },
    );
  },
);
