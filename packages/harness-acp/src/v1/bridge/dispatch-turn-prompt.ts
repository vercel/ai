import type { HarnessV1BridgeToolWire } from '@ai-sdk/harness';
import type { HostToolRelay } from './host-tool-relay';
import { promptAndRefreshInitialHostToolCatalog } from './refresh-host-tool-catalog';

/**
 * Dispatches the prompt of one turn while keeping host aborts authoritative.
 *
 * The host can abort a turn before its prompt is dispatched or while the
 * initial host-tool catalog refresh is still pending. A turn that was aborted
 * before dispatch must not prompt at all, and a failure that happens after the
 * prompt was dispatched must cancel that ACP prompt before it reaches the
 * host, so an abandoned turn never leaves the ACP agent running.
 */
export async function dispatchTurnPrompt({
  startPrompt,
  initialCatalogRefresh,
  abortSignal,
  cancel,
  onAbortedBeforePrompt,
}: {
  startPrompt: () => Promise<unknown>;
  /**
   * Set for the first prompt of an ACP session, which some agents only use to
   * discover their session MCP servers, so the prompt is dispatched before the
   * catalog refresh is awaited.
   */
  initialCatalogRefresh?: {
    relay: Pick<HostToolRelay, 'updateCatalog' | 'waitForCatalogRefresh'>;
    tools: ReadonlyArray<HarnessV1BridgeToolWire>;
    harnessId: string;
    timeoutMs: number;
  };
  abortSignal: AbortSignal;
  /** Idempotent ACP `session/cancel` for this turn. */
  cancel: () => Promise<unknown>;
  /** Wind the turn down without prompting. */
  onAbortedBeforePrompt: () => void;
}): Promise<{ promptDispatched: boolean }> {
  if (abortSignal.aborted) {
    onAbortedBeforePrompt();
    return { promptDispatched: false };
  }

  /*
   * Register cancellation before the prompt is dispatched: an abort that
   * arrives while the initial catalog refresh is pending must still reach the
   * ACP agent, and `cancel` is idempotent for the paths that follow.
   */
  abortSignal.addEventListener('abort', () => void cancel(), { once: true });

  try {
    if (initialCatalogRefresh == null) {
      void startPrompt();
      return { promptDispatched: true };
    }
    await promptAndRefreshInitialHostToolCatalog({
      startPrompt,
      ...initialCatalogRefresh,
      abortSignal,
    });
    return { promptDispatched: true };
  } catch (error) {
    /*
     * The catalog refresh failed or was abandoned on abort after the prompt
     * was dispatched. Cancel the running ACP prompt before the failure reaches
     * the host.
     */
    await cancel();
    throw error;
  }
}
