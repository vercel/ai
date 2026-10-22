import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { tool, type Tool } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { ToolLoopAgent } from './tool-loop-agent';
import type { ToolLoopAgentSettings } from './tool-loop-agent-settings';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from '../generate-text/generate-text';
import {
  isStepCount,
  type StopCondition,
} from '../generate-text/stop-condition';
import { streamText } from '../generate-text/stream-text';

const tools: { test: Tool<Record<string, never>, string> } = {
  test: tool({
    inputSchema: z.object({}),
    execute: async () => 'result',
  }),
};

describe.each([
  { method: 'generateText', limit: 1 },
  { method: 'streamText', limit: 1 },
  { method: 'agent.generate', limit: 20 },
  { method: 'agent.stream', limit: 20 },
])('default stop condition: $method', ({ method, limit }) => {
  const logger = vi.fn();
  let model: MockLanguageModelV4;
  let finishAtStep: number;

  beforeEach(() => {
    logger.mockClear();
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', logger);
    finishAtStep = Infinity;

    function response(step: number): LanguageModelV4GenerateResult {
      return {
        content:
          step === finishAtStep
            ? [{ type: 'text', text: 'done' }]
            : [
                {
                  type: 'tool-call',
                  toolCallId: `call-${step}`,
                  toolName: 'test',
                  input: '{}',
                },
              ],
        finishReason: {
          unified: step === finishAtStep ? 'stop' : 'tool-calls',
          raw: undefined,
        },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      };
    }

    model = new MockLanguageModelV4({
      doGenerate: async () => response(model.doGenerateCalls.length),
      doStream: async () => {
        const result = response(model.doStreamCalls.length);
        const part = result.content[0];
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            ...(part.type === 'tool-call'
              ? [part]
              : [
                  { type: 'text-start' as const, id: 'text' },
                  { type: 'text-delta' as const, id: 'text', delta: 'done' },
                  { type: 'text-end' as const, id: 'text' },
                ]),
            {
              type: 'finish',
              finishReason: result.finishReason,
              usage: result.usage,
            },
          ]),
        };
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function run(
    overrides: {
      tools?: typeof tools;
      stopWhen?: StopCondition<typeof tools> | StopCondition<typeof tools>[];
      prepareCall?: ToolLoopAgentSettings<never, typeof tools>['prepareCall'];
    } = {},
  ) {
    const settings = { model, tools, ...overrides };
    const prompt = 'Call the test tool.';

    switch (method) {
      case 'generateText':
        return (await generateText({ ...settings, prompt })).steps;
      case 'streamText': {
        const result = streamText({ ...settings, prompt });
        await result.consumeStream();
        return result.steps;
      }
      case 'agent.generate':
        return (await new ToolLoopAgent(settings).generate({ prompt })).steps;
      default: {
        const result = await new ToolLoopAgent(settings).stream({ prompt });
        await result.consumeStream();
        return result.steps;
      }
    }
  }

  it('warns only for the agent when the default limit prevents another tool round', async () => {
    const steps = await run();

    expect(steps).toHaveLength(limit);
    if (!method.startsWith('agent.')) {
      expect(logger).not.toHaveBeenCalled();
      return;
    }

    expect(logger).toHaveBeenCalledExactlyOnceWith({
      provider: 'mock-provider',
      model: 'mock-model-id',
      warnings: [
        {
          type: 'other',
          message: expect.stringContaining(`isStepCount(${limit})`),
        },
      ],
    });
    expect(logger.mock.calls[0][0].warnings[0].message).toContain('stopWhen');
  });

  it.each([1, limit])(
    'does not warn when the model finishes naturally on step %s',
    async step => {
      finishAtStep = step;
      expect(await run()).toHaveLength(step);
      expect(logger).not.toHaveBeenCalled();
    },
  );

  it('does not warn when a tool has no execute function', async () => {
    expect(
      await run({
        tools: {
          test: tool({ inputSchema: z.object({}), outputSchema: z.string() }),
        },
      }),
    ).toHaveLength(1);
    expect(logger).not.toHaveBeenCalled();
  });

  it('does not warn when a tool needs approval', async () => {
    expect(
      await run({ tools: { test: { ...tools.test, needsApproval: true } } }),
    ).toHaveLength(1);
    expect(logger).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'does not warn for an explicit default limit (array: %s)',
    async asArray => {
      const condition = isStepCount(limit);
      expect(
        await run({ stopWhen: asArray ? [condition] : condition }),
      ).toHaveLength(limit);
      expect(logger).not.toHaveBeenCalled();
    },
  );

  it('evaluates a custom condition only once per step', async () => {
    const stopWhen = vi.fn(isStepCount(2));
    expect(await run({ stopWhen })).toHaveLength(2);
    expect(stopWhen).toHaveBeenCalledTimes(2);
    expect(logger).not.toHaveBeenCalled();
  });

  it('respects disabled warning logging', async () => {
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', false);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await run()).toHaveLength(limit);
      expect(logger).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });

  if (method.startsWith('agent.')) {
    it('does not warn when prepareCall replaces the default limit', async () => {
      expect(
        await run({
          prepareCall: settings => ({
            ...settings,
            stopWhen: isStepCount(20),
          }),
        }),
      ).toHaveLength(20);
      expect(logger).not.toHaveBeenCalled();
    });

    it('preserves the default warning through prepareCall', async () => {
      expect(
        await run({ prepareCall: settings => ({ ...settings }) }),
      ).toHaveLength(20);
      expect(logger).toHaveBeenCalledOnce();
    });
  }
});
