import { ToolLoopAgent } from '../agent/tool-loop-agent';
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { experimental_toolCaller, tool } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { generateText } from '../generate-text/generate-text';
import { streamText } from '../generate-text/stream-text';
import { isStepCount } from '../generate-text/stop-condition';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { toolSearch } from './tool-search';

const usage: LanguageModelV4Usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe.each([
  'generateText',
  'streamText',
  'agent.generate',
  'agent.stream',
] as const)('%s tool search', mode => {
  it.each([false, true])(
    'adds discovered definitions on the next step without injecting messages (early call: %s)',
    async callEarly => {
      const executeWeather = vi.fn(
        ({ city }: { city: string }) => `${city}: sunny`,
      );
      const calls: LanguageModelV4CallOptions[] = [];
      const searchCall = {
        type: 'tool-call' as const,
        toolCallId: 'search',
        toolName: 'search',
        input: JSON.stringify({ query: 'weather' }),
      };
      const weatherCall = {
        type: 'tool-call' as const,
        toolCallId: 'weather',
        toolName: 'getWeather',
        input: JSON.stringify({ city: 'Bangalore' }),
      };
      const firstCalls = [
        searchCall,
        ...(callEarly ? [{ ...weatherCall, toolCallId: 'too-early' }] : []),
      ];
      const model = new MockLanguageModelV4({
        doGenerate: async options => {
          const step = calls.length;
          calls.push(options);
          if (step === 1) {
            expect(executeWeather).not.toHaveBeenCalled();
          }
          return {
            content:
              step === 0
                ? firstCalls
                : step === 1
                  ? [weatherCall]
                  : [{ type: 'text', text: 'sunny' }],
            usage,
            warnings: [],
            finishReason: {
              unified: step < 2 ? 'tool-calls' : 'stop',
              raw: undefined,
            },
          };
        },
        doStream: async options => {
          const step = calls.length;
          calls.push(options);
          if (step === 1) {
            expect(executeWeather).not.toHaveBeenCalled();
          }
          return {
            stream: convertArrayToReadableStream([
              ...(step === 0
                ? firstCalls
                : step === 1
                  ? [weatherCall]
                  : [
                      { type: 'text-start' as const, id: 'text' },
                      {
                        type: 'text-delta' as const,
                        id: 'text',
                        delta: 'sunny',
                      },
                      { type: 'text-end' as const, id: 'text' },
                    ]),
              {
                type: 'finish' as const,
                usage,
                finishReason: {
                  unified:
                    step < 2 ? ('tool-calls' as const) : ('stop' as const),
                  raw: undefined,
                },
              },
            ]),
          };
        },
      });
      const settings = {
        model,
        tools: {
          search: toolSearch(),
          getWeather: tool({
            deferLoading: true,
            description: 'Weather forecast',
            inputSchema: z.object({ city: z.string() }),
            execute: executeWeather,
          }),
          unrelated: tool({
            deferLoading: true,
            description: 'Send email',
            inputSchema: z.object({}),
          }),
        },
        prompt: 'Find the weather.',
        stopWhen: isStepCount(3),
      };
      const result =
        mode === 'generateText'
          ? await generateText(settings)
          : mode === 'streamText'
            ? streamText(settings)
            : mode === 'agent.generate'
              ? await new ToolLoopAgent(settings).generate({
                  prompt: settings.prompt,
                })
              : await new ToolLoopAgent(settings).stream({
                  prompt: settings.prompt,
                });

      expect(await result.text).toBe('sunny');
      expect(executeWeather).toHaveBeenCalledOnce();
      expect(executeWeather.mock.calls[0][0]).toEqual({ city: 'Bangalore' });
      expect(calls.map(call => call.tools?.map(tool => tool.name))).toEqual([
        ['search'],
        ['search', 'getWeather'],
        ['search', 'getWeather'],
      ]);
      expect(calls[1].tools?.[1]).toMatchObject({
        type: 'function',
        name: 'getWeather',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      });
      expect(calls[1].tools?.[0]).toEqual(calls[0].tools?.[0]);
      for (const call of calls) {
        expect(call.prompt.filter(message => message.role === 'user')).toEqual([
          { role: 'user', content: [{ type: 'text', text: settings.prompt }] },
        ]);
        expect(JSON.stringify(call)).not.toContain('unrelated');
      }
      const steps = await result.steps;
      expect(steps[0].toolResults[0].output).toEqual({
        tools: [{ name: 'getWeather', description: 'Weather forecast' }],
      });
      expect(steps[1].toolResults[0].output).toBe('Bangalore: sunny');
      if (callEarly) {
        expect(steps[0].content).toContainEqual(
          expect.objectContaining({
            type: 'tool-error',
            toolCallId: 'too-early',
          }),
        );
      }
    },
  );

  it('discovers a nested tool, announces it on the next step, and executes it with a stable model definition', async () => {
    const bindings: string[][] = [];
    const executeWeather = vi.fn(() => 'sunny');
    const inputSchema = z.object({
      name: z.string(),
      input: z.record(z.string(), z.unknown()),
    });
    const code = experimental_toolCaller(
      tool({ description: 'Stable code tool.', inputSchema }),
      {
        type: 'local',
        bind: tools => {
          bindings.push(Object.keys(tools));
          return tool({
            description: `Bound to ${Object.keys(tools)}`,
            inputSchema,
            execute: async ({ name, input }, options) =>
              await tools[name].execute!(input, options),
          });
        },
        prepareModelMessage: tools =>
          `Catalog: ${Object.keys(tools).join(', ')}`,
      },
    );
    const calls: LanguageModelV4CallOptions[] = [];
    const content = [
      [
        {
          type: 'tool-call' as const,
          toolCallId: 'search',
          toolName: 'code',
          input: JSON.stringify({
            name: 'search',
            input: { query: 'weather' },
          }),
        },
      ],
      [
        {
          type: 'tool-call' as const,
          toolCallId: 'weather',
          toolName: 'code',
          input: JSON.stringify({ name: 'getWeather', input: {} }),
        },
      ],
      [{ type: 'text' as const, text: 'sunny' }],
    ];
    const model = new MockLanguageModelV4({
      doGenerate: async options => {
        const step = calls.length;
        calls.push(options);
        return {
          content: content[step],
          usage,
          warnings: [],
          finishReason: {
            unified: step < 2 ? 'tool-calls' : 'stop',
            raw: undefined,
          },
        };
      },
      doStream: async options => {
        const step = calls.length;
        calls.push(options);
        return {
          stream: convertArrayToReadableStream([
            ...(step < 2
              ? content[step].filter(part => part.type === 'tool-call')
              : [
                  { type: 'text-start' as const, id: 'text' },
                  { type: 'text-delta' as const, id: 'text', delta: 'sunny' },
                  { type: 'text-end' as const, id: 'text' },
                ]),
            {
              type: 'finish' as const,
              usage,
              finishReason: {
                unified: step < 2 ? ('tool-calls' as const) : ('stop' as const),
                raw: undefined,
              },
            },
          ]),
        };
      },
    });
    const settings = {
      model,
      tools: {
        code,
        search: toolSearch(),
        getWeather: tool({
          deferLoading: true,
          description: 'Weather forecast',
          inputSchema: z.object({}),
          execute: executeWeather,
        }),
        unrelated: tool({
          deferLoading: true,
          description: 'Send email',
          inputSchema: z.object({}),
        }),
      },
      experimental_toolCallers: {
        search: ['code'],
        getWeather: ['code'],
        unrelated: ['code'],
      } as const,
      prompt: 'Find the weather.',
      stopWhen: isStepCount(3),
    };

    const result =
      mode === 'generateText'
        ? await generateText(settings)
        : mode === 'streamText'
          ? streamText(settings)
          : mode === 'agent.generate'
            ? await new ToolLoopAgent(settings).generate({
                prompt: settings.prompt,
              })
            : await new ToolLoopAgent(settings).stream({
                prompt: settings.prompt,
              });
    expect(await result.text).toBe('sunny');
    expect(executeWeather).toHaveBeenCalledOnce();
    expect(bindings).toEqual([
      ['search'],
      ['search', 'getWeather'],
      ['search', 'getWeather'],
    ]);
    expect(calls.map(call => call.tools)).toEqual([
      calls[0].tools,
      calls[0].tools,
      calls[0].tools,
    ]);
    expect(calls[0].tools?.map(tool => tool.name)).toEqual(['code']);
    expect(JSON.stringify(calls[0].prompt)).not.toContain('getWeather');
    expect(calls[1].prompt).toContainEqual({
      role: 'user',
      content: [{ type: 'text', text: 'Catalog: search, getWeather' }],
    });
    expect(calls[1].prompt.slice(0, calls[0].prompt.length)).toEqual(
      calls[0].prompt,
    );
    expect(
      JSON.stringify(calls[2].prompt).match(/Catalog: search, getWeather/g),
    ).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain('unrelated');
  });
});
