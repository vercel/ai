import {
  HarnessBridgeCapabilityUnsupportedError,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';
import { dispatchTurnPrompt } from './dispatch-turn-prompt';
import { createACPPermissionController } from './permission-controller';

const tools = [{ name: 'weather', inputSchema: { type: 'object' } }];

function initialCatalogRefresh({
  waitForCatalogRefresh,
}: {
  waitForCatalogRefresh: () => Promise<boolean>;
}) {
  return {
    relay: {
      updateCatalog: () => ({ changed: true, revision: 2 }),
      waitForCatalogRefresh,
    },
    tools,
    harnessId: 'lazy-acp',
    timeoutMs: 10_000,
  };
}

describe('dispatchTurnPrompt', () => {
  it('does not dispatch a prompt for a turn the host already aborted', async () => {
    const turnAbort = new AbortController();
    turnAbort.abort();
    const startPrompt = vi.fn(async () => {});
    const cancel = vi.fn(async () => {});
    const onAbortedBeforePrompt = vi.fn();

    await expect(
      dispatchTurnPrompt({
        startPrompt,
        abortSignal: turnAbort.signal,
        cancel,
        onAbortedBeforePrompt,
        initialCatalogRefresh: initialCatalogRefresh({
          waitForCatalogRefresh: async () => true,
        }),
      }),
    ).resolves.toEqual({ promptDispatched: false });

    expect(startPrompt).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(onAbortedBeforePrompt).toHaveBeenCalledOnce();
  });

  it('dispatches the initial prompt before waiting for the catalog', async () => {
    const calls: string[] = [];

    await dispatchTurnPrompt({
      startPrompt: async () => {
        calls.push('prompt');
      },
      abortSignal: new AbortController().signal,
      cancel: async () => {},
      onAbortedBeforePrompt: () => {},
      initialCatalogRefresh: initialCatalogRefresh({
        waitForCatalogRefresh: async () => {
          calls.push('wait');
          return true;
        },
      }),
    });

    expect(calls).toEqual(['prompt', 'wait']);
  });

  it('registers cancellation before the prompt is dispatched', async () => {
    const turnAbort = new AbortController();
    const cancel = vi.fn(async () => {});
    const startPrompt = vi.fn(async () => {
      /* Abort inside the dispatch: only a listener registered beforehand runs. */
      turnAbort.abort();
    });

    await expect(
      dispatchTurnPrompt({
        startPrompt,
        abortSignal: turnAbort.signal,
        cancel,
        onAbortedBeforePrompt: () => {},
      }),
    ).resolves.toEqual({ promptDispatched: true });

    expect(startPrompt).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels the dispatched prompt as soon as the turn is aborted during the catalog wait', async () => {
    const turnAbort = new AbortController();
    const startPrompt = vi.fn(async () => {});
    const cancel = vi.fn(async () => {});

    const dispatch = dispatchTurnPrompt({
      startPrompt,
      abortSignal: turnAbort.signal,
      cancel,
      onAbortedBeforePrompt: () => {},
      initialCatalogRefresh: initialCatalogRefresh({
        waitForCatalogRefresh: () => new Promise<boolean>(() => {}),
      }),
    });
    expect(startPrompt).toHaveBeenCalledOnce();

    turnAbort.abort();

    await expect(dispatch).rejects.toBe(turnAbort.signal.reason);
    expect(startPrompt).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalled();
  });

  it('cancels the dispatched prompt when the catalog wait times out', async () => {
    const calls: string[] = [];
    const startPrompt = vi.fn(async () => {});
    const cancel = vi.fn(async () => {
      calls.push('cancel');
    });

    const dispatch = dispatchTurnPrompt({
      startPrompt,
      abortSignal: new AbortController().signal,
      cancel,
      onAbortedBeforePrompt: () => {},
      initialCatalogRefresh: initialCatalogRefresh({
        waitForCatalogRefresh: async () => false,
      }),
    });

    await expect(dispatch).rejects.toSatisfy(error =>
      HarnessBridgeCapabilityUnsupportedError.isInstance(error),
    );
    expect(startPrompt).toHaveBeenCalledOnce();
    expect(calls).toEqual(['cancel']);
  });

  it('cancels a cold-restored first turn aborted during the refresh and grants no approval afterwards', async () => {
    const turnAbort = new AbortController();
    const workDir = '/workspace/session-1';
    const turn = {
      abortSignal: turnAbort.signal,
      emit: () => {},
      emitWarning: () => {},
      requestToolApproval: async () => ({ approved: false }),
    } as unknown as BridgeTurn;
    const controller = createACPPermissionController({
      turn,
      sessionId: 'session-1',
      workDir,
      permissionMode: 'allow-edits',
      hasPermissionModeMapping: false,
      emitToolCall: () => {},
      claimHostToolPermission: async () => undefined,
    });
    const cancel = vi.fn(async () => {
      controller.cancelAll();
    });

    /*
     * A cold-restored session returns before prompting, so its next turn is
     * the session's first prompt and refreshes the catalog after dispatching.
     */
    const dispatch = dispatchTurnPrompt({
      startPrompt: async () => {},
      abortSignal: turnAbort.signal,
      cancel,
      onAbortedBeforePrompt: () => {},
      initialCatalogRefresh: initialCatalogRefresh({
        waitForCatalogRefresh: () => new Promise<boolean>(() => {}),
      }),
    });
    turnAbort.abort();

    await expect(dispatch).rejects.toBe(turnAbort.signal.reason);
    expect(cancel).toHaveBeenCalled();

    const request: RequestPermissionRequest = {
      sessionId: 'session-1',
      toolCall: {
        toolCallId: 'call-1',
        kind: 'edit',
        status: 'pending',
        locations: [{ path: `${workDir}/src/hello.ts` }],
      },
      options: [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' },
      ],
    };
    await expect(controller.requestPermission(request)).resolves.toEqual({
      outcome: { outcome: 'cancelled' },
    });
  });
});
