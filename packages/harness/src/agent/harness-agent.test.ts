import type {
  HarnessV1,
  HarnessV1PromptControl,
  HarnessV1PromptOptions,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '../v1';
import { tool } from '@ai-sdk/provider-utils';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { HarnessAgent } from './harness-agent';

/**
 * Build a mock harness whose session emits a canned event script. Each
 * event is emitted synchronously; the `done` promise resolves once the
 * script has been delivered.
 *
 * The mock also records every prompt the harness receives + every tool
 * result the host submits back so tests can assert on them.
 */
function mockHarness(options: {
  script: (
    submitToolResult: (input: {
      toolCallId: string;
      output: unknown;
    }) => Promise<void>,
  ) => HarnessV1StreamPart[];
}): {
  harness: HarnessV1;
  prompts: HarnessV1PromptOptions['prompt'][];
  toolResults: { toolCallId: string; output: unknown }[];
  doStop: ReturnType<typeof vi.fn>;
} {
  const prompts: HarnessV1PromptOptions['prompt'][] = [];
  const toolResults: { toolCallId: string; output: unknown }[] = [];
  const doStop = vi.fn(async () => {});

  const session: HarnessV1Session = {
    sessionId: 'mock-session-1',
    doPrompt: async (opts: HarnessV1PromptOptions) => {
      prompts.push(opts.prompt);
      const control: HarnessV1PromptControl = {
        submitToolResult: async input => {
          toolResults.push(input);
        },
        done: Promise.resolve(),
      };
      const events = options.script(async input => {
        await control.submitToolResult(input);
      });
      // Emit on a microtask so the consumer can await doPrompt first.
      queueMicrotask(() => {
        for (const event of events) opts.emit(event);
      });
      return control;
    },
    doStop,
  };

  return {
    harness: {
      specificationVersion: 'harness-v1',
      harnessId: 'mock',
      builtinTools: {},
      doStart: async () => session,
    },
    prompts,
    toolResults,
    doStop,
  };
}

describe('HarnessAgent', () => {
  test('exposes the AI SDK Agent contract surface', () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness, id: 'a1' });
    expect(agent.version).toBe('agent-v1');
    expect(agent.id).toBe('a1');
    expect(agent.harnessId).toBe('mock');
    expect(typeof agent.sessionId).toBe('string');
    expect(agent.tools).toEqual({});
  });

  test('generate() returns text + steps for a simple text-only turn', async () => {
    const { harness } = mockHarness({
      script: () => [
        { type: 'stream-start' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Hello, ' },
        { type: 'text-delta', id: 't1', delta: 'world.' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: {
            inputTokens: {
              total: 5,
              noCache: 5,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 2, text: 2, reasoning: undefined },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: {
            inputTokens: {
              total: 5,
              noCache: 5,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 2, text: 2, reasoning: undefined },
          },
        },
      ],
    });

    const agent = new HarnessAgent({ harness });
    const result = await agent.generate({ prompt: 'hi' });

    expect(result.text).toBe('Hello, world.');
    expect(result.finishReason).toBe('stop');
    expect(result.rawFinishReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(5);
    expect(result.usage.outputTokens).toBe(2);
    expect(result.usage.totalTokens).toBe(7);
    expect(result.steps).toHaveLength(1);
    expect(result.finalStep.text).toBe('Hello, world.');
    expect(result.toolCalls).toEqual([]);
    expect(result.toolResults).toEqual([]);
    expect(result.responseMessages).toHaveLength(1);
    expect(result.responseMessages[0]!.role).toBe('assistant');

    await agent.close();
  });

  test('stream() returns a result whose fullStream emits translated parts', async () => {
    const { harness } = mockHarness({
      script: () => [
        { type: 'stream-start' },
        { type: 'text-delta', id: 't1', delta: 'Hi' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
    });

    const agent = new HarnessAgent({ harness });
    const result = await agent.stream({ prompt: 'hi' });

    const types: string[] = [];
    for await (const part of result.fullStream) {
      types.push(part.type);
    }

    // The harness emits stream-start, text-delta, finish-step, finish.
    // The agent: drops stream-start, forwards text-delta, emits its own
    // finish-step at the boundary, then a finish-step pass-through is
    // suppressed by the translator. Final agent-emitted finish closes.
    expect(types).toContain('text-delta');
    expect(types).toContain('finish-step');
    expect(types).toContain('finish');
    expect(await result.text).toBe('Hi');

    await agent.close();
  });

  test('host-side tools are executed and the result is submitted back', async () => {
    const { harness, toolResults } = mockHarness({
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'echo',
          input: JSON.stringify({ value: 'ping' }),
        },
        {
          type: 'finish-step',
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
    });

    const echo = tool({
      description: 'Echo a string',
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }: { value: string }) => ({ echoed: value }),
    });

    const agent = new HarnessAgent({ harness, tools: { echo } });
    const result = await agent.generate({ prompt: 'go' });

    expect(toolResults).toEqual([
      { toolCallId: 'c1', output: { echoed: 'ping' } },
    ]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.toolName).toBe('echo');

    await agent.close();
  });

  test('reuses the session across multiple generate() calls (sticky session)', async () => {
    const { harness, prompts, doStop } = mockHarness({
      script: () => [
        { type: 'text-delta', id: 't', delta: 'ok' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
    });

    const agent = new HarnessAgent({ harness });
    await agent.generate({ prompt: 'one' });
    await agent.generate({ prompt: 'two' });

    expect(prompts).toHaveLength(2);
    // doStop is only called on close(), not between turns.
    expect(doStop).not.toHaveBeenCalled();

    await agent.close();
    expect(doStop).toHaveBeenCalledTimes(1);

    // After close, further generate() calls should fail.
    await expect(agent.generate({ prompt: 'three' })).rejects.toThrow(
      /closed/i,
    );
  });

  test('detach() throws when the harness session does not support it', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });
    // Force lazy start so the session exists.
    await agent.generate({ prompt: 'hi' }).catch(() => {});
    await expect(agent.detach()).rejects.toThrow(/does not support detach/i);
  });
});
