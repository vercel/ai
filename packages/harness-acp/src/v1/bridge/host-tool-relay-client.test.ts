import { describe, expect, it, vi } from 'vitest';
import { postHostToolRelay } from './host-tool-relay-client';
import { startHostToolRelay, type HostToolRelayTurn } from './host-tool-relay';

describe('postHostToolRelay', () => {
  it('keeps an invocation pending for more than five minutes', async () => {
    let resolveResult!: (result: { output: unknown }) => void;
    const pendingResult = new Promise<{ output: unknown }>(resolve => {
      resolveResult = resolve;
    });
    let markInvocationStarted!: () => void;
    const invocationStarted = new Promise<void>(resolve => {
      markInvocationStarted = resolve;
    });
    const turn: HostToolRelayTurn = {
      emitToolCall: markInvocationStarted,
      emitToolResult: vi.fn(),
      requestToolResult: () => pendingResult,
      registerCorrelationInvocation: vi.fn(),
      removeCorrelationInvocation: vi.fn(),
    };
    const relay = await startHostToolRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
      serverName: 'ai-sdk-harness-tools',
    });
    relay.bindTurn({ turn });

    vi.useFakeTimers();
    try {
      const responsePromise = postHostToolRelay({
        relayUrl: relay.url,
        relayCredential: relay.credential,
        path: '/invoke',
        body: {
          requestId: 'host-call-1',
          toolName: 'weather',
          input: { city: 'Lima' },
          catalogRevision: 1,
        },
      });
      let responseSettled = false;
      void responsePromise.then(
        () => {
          responseSettled = true;
        },
        () => {
          responseSettled = true;
        },
      );

      await invocationStarted;
      await vi.advanceTimersByTimeAsync(300_001);
      expect(responseSettled).toBe(false);

      resolveResult({ output: { celsius: 19 } });
      await expect(responsePromise).resolves.toMatchObject({
        status: 200,
        ok: true,
        value: {
          output: { celsius: 19 },
          correlationToken: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      });
    } finally {
      vi.useRealTimers();
      relay.unbindTurn({ turn });
      await relay.close();
    }
  });
});
