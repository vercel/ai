import type { Experimental_SandboxProcess } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import type { JcodeBridgeOutboundMessage } from './jcode-bridge-protocol';
import {
  createJcodeBridgeSession,
  type JcodeBridgeChannel,
} from './jcode-bridge-session';

class FakeChannel {
  readonly sent: unknown[] = [];
  private readonly listeners = new Map<
    string,
    Set<(message: JcodeBridgeOutboundMessage) => void>
  >();
  private closed = false;
  private closeListener:
    | ((code: number | undefined, reason: string | undefined) => void)
    | undefined;

  on(type: string, listener: (message: JcodeBridgeOutboundMessage) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  onClose(
    listener: (code: number | undefined, reason: string | undefined) => void,
  ) {
    this.closeListener = listener;
  }
  beginClose() {}
  isClosed() {
    return this.closed;
  }
  send(message: unknown) {
    this.sent.push(message);
  }
  close() {
    this.closed = true;
  }
  emit(message: JcodeBridgeOutboundMessage) {
    for (const listener of this.listeners.get(message.type) ?? []) {
      listener(message);
    }
  }
  emitClose(code?: number, reason?: string) {
    this.closeListener?.(code, reason);
  }
}

const fakeProcess = (): Experimental_SandboxProcess =>
  ({
    stdout: new ReadableStream(),
    stderr: new ReadableStream(),
    wait: async () => ({ exitCode: 0 }),
    kill: async () => {},
  }) as Experimental_SandboxProcess;

describe('createJcodeBridgeSession', () => {
  it('sends typed prompt and compaction turns and forwards stream events', async () => {
    const channel = new FakeChannel();
    const session = createJcodeBridgeSession({
      sessionId: 'session-1',
      channel: channel as unknown as JcodeBridgeChannel,
      proc: fakeProcess(),
      model: 'test-model',
      reasoningEffort: 'high',
      jcodeHome: '/sandbox/jcode-home',
    });
    const emitted: JcodeBridgeOutboundMessage[] = [];
    const control = await session.doPromptTurn({
      prompt: 'hello',
      instructions: 'be concise',
      emit: part => emitted.push(part as JcodeBridgeOutboundMessage),
    });
    expect(channel.sent[0]).toMatchObject({
      type: 'start',
      operation: 'prompt',
      model: 'test-model',
      reasoningEffort: 'high',
    });
    expect((channel.sent[0] as { prompt: string }).prompt).toContain(
      'be concise',
    );

    channel.emit({ type: 'text-start', id: 'text-1' });
    channel.emit({ type: 'text-delta', id: 'text-1', delta: 'hello' });
    channel.emit({ type: 'text-end', id: 'text-1' });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
    });
    await control.done;
    expect(emitted.map(part => part.type)).toEqual([
      'text-start',
      'text-delta',
      'text-end',
      'finish',
    ]);

    const compact = session.doCompact();
    expect(channel.sent.at(-1)).toMatchObject({
      type: 'start',
      operation: 'compact',
    });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'compact' },
      totalUsage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
    });
    await compact;
  });

  it('sends resume identity without reframing instructions', async () => {
    const channel = new FakeChannel();
    const session = createJcodeBridgeSession({
      sessionId: 'session-1',
      channel: channel as unknown as JcodeBridgeChannel,
      proc: fakeProcess(),
      resumeJcodeSessionId: 'native-session',
      jcodeHome: '/sandbox/jcode-home',
    });

    const control = await session.doPromptTurn({
      prompt: 'continue',
      instructions: 'must not be injected on resume',
      emit: () => {},
    });

    expect(channel.sent).toEqual([
      {
        type: 'start',
        operation: 'prompt',
        prompt: 'continue',
        resumeSessionId: 'native-session',
      },
    ]);
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
    });
    await control.done;
  });

  it('aborts an active turn and rejects when the bridge closes early', async () => {
    const channel = new FakeChannel();
    const session = createJcodeBridgeSession({
      sessionId: 'session-1',
      channel: channel as unknown as JcodeBridgeChannel,
      proc: fakeProcess(),
      jcodeHome: '/sandbox/jcode-home',
    });
    const abort = new AbortController();
    const aborted = await session.doPromptTurn({
      prompt: 'wait',
      abortSignal: abort.signal,
      emit: () => {},
    });
    abort.abort(new Error('cancelled'));

    await expect(aborted.done).rejects.toThrow('cancelled');
    expect(channel.sent).toContainEqual({ type: 'abort' });

    const closing = await session.doPromptTurn({
      prompt: 'again',
      emit: () => {},
    });
    channel.emitClose(1006, 'socket lost');
    await expect(closing.done).rejects.toThrow(
      'jcode bridge closed before the turn finished: socket lost',
    );
  });

  it.each(['doStop', 'doDestroy'] as const)(
    '%s closes the channel and kills the bridge process',
    async operation => {
      const channel = new FakeChannel();
      const proc = fakeProcess();
      proc.wait = vi.fn(async () => ({ exitCode: 0 }));
      proc.kill = vi.fn(async () => {});
      const session = createJcodeBridgeSession({
        sessionId: 'session-1',
        channel: channel as unknown as JcodeBridgeChannel,
        proc,
        jcodeHome: '/sandbox/jcode-home',
      });

      const closing = session[operation]();
      if (operation === 'doStop') {
        channel.emit({ type: 'bridge-stop', data: {} });
      }
      await closing;

      expect(channel.isClosed()).toBe(true);
      expect(proc.kill).toHaveBeenCalledOnce();
      await expect(
        session.doPromptTurn({ prompt: 'closed', emit: () => {} }),
      ).rejects.toThrow('jcode harness session is closed');
    },
  );

  it('forwards host tools and their results over the bridge', async () => {
    const channel = new FakeChannel();
    const session = createJcodeBridgeSession({
      sessionId: 'session-1',
      channel: channel as unknown as JcodeBridgeChannel,
      proc: fakeProcess(),
      jcodeHome: '/sandbox/jcode-home',
    });
    const control = await session.doPromptTurn({
      prompt: 'hello',
      tools: [{ name: 'weather', description: 'Get weather', inputSchema: {} }],
      emit: () => {},
    });
    expect(channel.sent[0]).toMatchObject({
      type: 'start',
      tools: [{ name: 'weather', description: 'Get weather', inputSchema: {} }],
    });
    await control.submitToolResult({
      toolCallId: 'call-1',
      output: { temperature: 21 },
      isError: false,
    });
    expect(channel.sent[1]).toEqual({
      type: 'tool-result',
      toolCallId: 'call-1',
      output: { temperature: 21 },
      isError: false,
    });
    channel.emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
    });
    await control.done;
  });

  it('rejects unsupported suspend, continue, and detach', async () => {
    const session = createJcodeBridgeSession({
      sessionId: 'session-1',
      channel: new FakeChannel() as unknown as JcodeBridgeChannel,
      proc: fakeProcess(),
      jcodeHome: '/sandbox/jcode-home',
    });
    await expect(session.doSuspendTurn()).rejects.toThrow(
      'turn suspension is not supported yet',
    );
    await expect(session.doContinueTurn({ emit: () => {} })).rejects.toThrow(
      'turn continuation is not supported yet',
    );
    await expect(session.doDetach()).rejects.toThrow(
      'detaching a live sandbox bridge is not supported yet',
    );
  });

  it('returns bridge stop data as resumable state', async () => {
    const channel = new FakeChannel();
    const session = createJcodeBridgeSession({
      sessionId: 'session-1',
      channel: channel as unknown as JcodeBridgeChannel,
      proc: fakeProcess(),
      jcodeHome: '/sandbox/jcode-home',
    });
    const stopping = session.doStop();
    channel.emit({
      type: 'bridge-stop',
      data: { jcodeSessionId: 'native-session' },
    });
    await expect(stopping).resolves.toMatchObject({
      type: 'resume-session',
      data: {
        jcodeSessionId: 'native-session',
        jcodeHome: '/sandbox/jcode-home',
      },
    });
  });
});
