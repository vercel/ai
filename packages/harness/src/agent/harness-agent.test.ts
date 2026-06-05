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
  doCompact: ReturnType<typeof vi.fn>;
} {
  const prompts: HarnessV1PromptOptions['prompt'][] = [];
  const toolResults: { toolCallId: string; output: unknown }[] = [];
  const doStop = vi.fn(async () => {});
  const doCompact = vi.fn(async (_customInstructions?: string) => {});

  const session: HarnessV1Session = {
    sessionId: 'mock-session-1',
    doPromptTurn: async (opts: HarnessV1PromptOptions) => {
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
      // Emit on a microtask so the consumer can await doPromptTurn first.
      queueMicrotask(() => {
        for (const event of events) opts.emit(event);
      });
      return control;
    },
    doCompact,
    doStop,
    doGetResumeHandle: () => ({
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doContinueTurn: async () => ({
      submitToolResult: async () => {},
      done: Promise.resolve(),
    }),
    doSuspendTurn: async () => ({
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    }),
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
    doCompact,
  };
}

describe('HarnessAgent', () => {
  test('exposes the AI SDK Agent contract surface', () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness, id: 'a1' });
    expect(agent.version).toBe('agent-v1');
    expect(agent.id).toBe('a1');
    expect(agent.harnessId).toBe('mock');
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
    const session = await agent.createSession();
    const result = await agent.generate({ session, prompt: 'hi' });

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

    await session.close();
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
    const session = await agent.createSession();
    const result = await agent.stream({ session, prompt: 'hi' });

    const types: string[] = [];
    for await (const part of result.fullStream) {
      types.push(part.type);
    }

    expect(types).toContain('text-delta');
    expect(types).toContain('finish-step');
    expect(types).toContain('finish');
    expect(await result.text).toBe('Hi');

    await session.close();
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
    const session = await agent.createSession();
    const result = await agent.generate({ session, prompt: 'go' });

    expect(toolResults).toEqual([
      { toolCallId: 'c1', output: { echoed: 'ping' } },
    ]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.toolName).toBe('echo');

    await session.close();
  });

  test('a single session can drive multiple generate() turns', async () => {
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
    const session = await agent.createSession();
    await agent.generate({ session, prompt: 'one' });
    await agent.generate({ session, prompt: 'two' });

    expect(prompts).toHaveLength(2);
    // doStop is only called on close, not between turns.
    expect(doStop).not.toHaveBeenCalled();

    await session.close();
    expect(doStop).toHaveBeenCalledTimes(1);
  });

  test('session.close() is idempotent and rejects further turns', async () => {
    const { harness, doStop } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession();

    await session.close();
    await session.close();
    expect(doStop).toHaveBeenCalledTimes(1);

    await expect(
      agent.generate({ session, prompt: 'after close' }),
    ).rejects.toThrow(/has been closed/);
  });

  test('normalizes prompt input — string passes through, message array is reduced to the last user message', async () => {
    function finishOnly(): HarnessV1StreamPart[] {
      return [
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
      ];
    }

    const { harness, prompts } = mockHarness({ script: finishOnly });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession();

    await agent.generate({ session, prompt: 'plain string' });
    await agent.generate({
      session,
      messages: [
        { role: 'system', content: 'be terse' },
        { role: 'user', content: 'older user turn — dropped' },
        { role: 'assistant', content: 'older assistant turn — dropped' },
        { role: 'user', content: 'latest user turn' },
      ],
    });
    await agent.generate({
      session,
      prompt: [
        { role: 'user', content: 'discarded' },
        { role: 'assistant', content: 'discarded too' },
        { role: 'user', content: [{ type: 'text', text: 'final turn' }] },
      ],
    });

    expect(prompts).toEqual([
      'plain string',
      { role: 'user', content: 'latest user turn' },
      { role: 'user', content: [{ type: 'text', text: 'final turn' }] },
    ]);

    await expect(
      agent.generate({
        session,
        messages: [
          { role: 'system', content: 'no user message here' },
          { role: 'assistant', content: 'nothing for the harness to run' },
        ],
      }),
    ).rejects.toThrow(/at least one `role: "user"` entry/);

    await session.close();
  });

  test('session.detach() throws when the harness session does not support it', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession();
    await expect(session.detach()).rejects.toThrow(/does not support detach/i);
    await session.close();
  });

  test('session.compact() forwards to the harness session doCompact, then throws once closed', async () => {
    const { harness, doCompact } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession();

    await session.compact();
    await session.compact('keep the error trace');
    expect(doCompact).toHaveBeenCalledTimes(2);
    expect(doCompact).toHaveBeenNthCalledWith(1, undefined);
    expect(doCompact).toHaveBeenNthCalledWith(2, 'keep the error trace');

    await session.close();
    await expect(session.compact()).rejects.toThrow(/closed/i);
  });

  test('getResumeHandle() returns validated coords, surfaces recoveryMode, and leaves the session usable', async () => {
    const doStop = vi.fn(async () => {});
    const underlying: HarnessV1Session = {
      sessionId: 's-attach',
      recoveryMode: 'attach',
      doPromptTurn: async (opts: HarnessV1PromptOptions) => {
        queueMicrotask(() => opts.emit({ type: 'finish' } as never));
        return { submitToolResult: async () => {}, done: Promise.resolve() };
      },
      doCompact: async () => {},
      doStop,
      doGetResumeHandle: () => ({
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: { bridge: { port: 5001, token: 't', lastSeenEventId: 3 } },
      }),
      doContinueTurn: async () => ({
        submitToolResult: async () => {},
        done: Promise.resolve(),
      }),
      doSuspendTurn: async () => ({
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: { bridge: { port: 5001, token: 't', lastSeenEventId: 3 } },
      }),
    };
    const harness: HarnessV1 = {
      specificationVersion: 'harness-v1',
      harnessId: 'mock',
      builtinTools: {},
      resumeStateSchema: z.object({
        bridge: z
          .object({
            port: z.number(),
            token: z.string(),
            lastSeenEventId: z.number(),
          })
          .optional(),
      }),
      doStart: async () => underlying,
    };

    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession();
    expect(session.recoveryMode).toBe('attach');

    const handle = await session.getResumeHandle();
    expect(handle).toEqual({
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: { bridge: { port: 5001, token: 't', lastSeenEventId: 3 } },
    });
    // Non-destructive: the session is still active.
    expect(doStop).not.toHaveBeenCalled();
    const second = await session.getResumeHandle();
    expect(second).toEqual(handle);

    await session.close();
  });
});
