import { describe, expect, test, vi } from 'vitest';
import type {
  HarnessV1PromptControl,
  HarnessV1PromptOptions,
} from '../../v1/harness-v1-call-options';
import type { HarnessV1Session } from '../../v1/harness-v1-session';
import type { HarnessV1StreamPart } from '../../v1/harness-v1-stream-part';
import { toHarnessStream } from './to-harness-stream';

function makeSession(opts: {
  run: (emit: (part: HarnessV1StreamPart) => void) => Promise<void>;
  control?: Partial<HarnessV1PromptControl>;
}): HarnessV1Session {
  return {
    sessionId: 'session-1',
    doPrompt: async (callOpts: HarnessV1PromptOptions) => {
      const done = opts.run(callOpts.emit);
      return {
        submitToolResult: vi.fn(async () => {}),
        ...opts.control,
        done,
      } as HarnessV1PromptControl;
    },
    doStop: vi.fn(async () => {}),
  };
}

async function collect(
  stream: ReadableStream<HarnessV1StreamPart>,
): Promise<HarnessV1StreamPart[]> {
  const parts: HarnessV1StreamPart[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return parts;
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

describe('toHarnessStream', () => {
  test('forwards emitted events in order and closes when done resolves', async () => {
    const session = makeSession({
      run: async emit => {
        emit({ type: 'stream-start' });
        emit({ type: 'text-start', id: 't1' });
        emit({ type: 'text-delta', id: 't1', delta: 'hello' });
        emit({ type: 'text-end', id: 't1' });
        emit({
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 5, text: 5, reasoning: undefined },
          },
        });
      },
    });

    const { stream } = await toHarnessStream({
      session,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    const parts = await collect(stream);
    expect(parts.map(p => p.type)).toEqual([
      'stream-start',
      'text-start',
      'text-delta',
      'text-end',
      'finish',
    ]);
  });

  test('returns the same control handle doPrompt produced', async () => {
    const submitToolResult = vi.fn(async () => {});
    const session = makeSession({
      run: async () => {},
      control: { submitToolResult },
    });

    const { control } = await toHarnessStream({
      session,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    await control.submitToolResult({ toolCallId: 'c1', output: 'ok' });
    expect(submitToolResult).toHaveBeenCalledWith({
      toolCallId: 'c1',
      output: 'ok',
    });
  });

  test('enqueues an error part and errors the stream when done rejects', async () => {
    const boom = new Error('boom');
    let signalFailure!: (err: unknown) => void;
    const session: HarnessV1Session = {
      sessionId: 's',
      doPrompt: async callOpts => {
        callOpts.emit({ type: 'text-delta', id: 't', delta: 'partial' });
        const done = new Promise<void>((_, reject) => {
          signalFailure = reject;
        });
        return {
          submitToolResult: vi.fn(async () => {}),
          done,
        } as HarnessV1PromptControl;
      },
      doStop: async () => {},
    };

    const { stream } = await toHarnessStream({
      session,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    // Trigger the failure after the stream is wired up. This mirrors how a
    // real adapter signals an error — the bridge / native runtime rejects
    // the done promise from a later async tick.
    signalFailure(boom);

    const parts = await collect(stream);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ type: 'text-delta', delta: 'partial' });
    expect(parts[1]).toMatchObject({ type: 'error', error: boom });
  });

  test('passes prompt + tools + instructions through to doPrompt', async () => {
    const doPrompt = vi.fn(
      async (
        _opts: HarnessV1PromptOptions,
      ): Promise<HarnessV1PromptControl> => ({
        submitToolResult: vi.fn(async () => {}),
        done: Promise.resolve(),
      }),
    );
    const session: HarnessV1Session = {
      sessionId: 's',
      doPrompt,
      doStop: async () => {},
    };

    await toHarnessStream({
      session,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [{ name: 'myTool' }],
      instructions: 'be brief',
    });

    expect(doPrompt).toHaveBeenCalledTimes(1);
    const arg = doPrompt.mock.calls[0]![0]!;
    expect(arg.prompt).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ]);
    expect(arg.tools).toEqual([{ name: 'myTool' }]);
    expect(arg.instructions).toBe('be brief');
    expect(typeof arg.emit).toBe('function');
  });

  test('forwards the abort signal to doPrompt', async () => {
    const ac = new AbortController();
    const doPrompt = vi.fn(
      async (
        _opts: HarnessV1PromptOptions,
      ): Promise<HarnessV1PromptControl> => ({
        submitToolResult: vi.fn(async () => {}),
        done: Promise.resolve(),
      }),
    );
    const session: HarnessV1Session = {
      sessionId: 's',
      doPrompt,
      doStop: async () => {},
    };

    await toHarnessStream({
      session,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      abortSignal: ac.signal,
    });

    const arg = doPrompt.mock.calls[0]![0]!;
    expect(arg.abortSignal).toBe(ac.signal);
  });
});
