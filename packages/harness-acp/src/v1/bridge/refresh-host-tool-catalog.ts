import type { HarnessV1BridgeToolWire } from '@ai-sdk/harness';
import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import type { HostToolRelay } from './host-tool-relay';

/*
 * Some ACP agents start session MCP servers only after receiving the first
 * prompt. Starting that prompt before waiting lets those agents discover the
 * initial catalog, while the relay's revision checks still reject stale or
 * unknown tool invocations.
 */
export async function promptAndRefreshInitialHostToolCatalog({
  startPrompt,
  relay,
  tools,
  harnessId,
  timeoutMs,
  abortSignal,
}: {
  startPrompt: () => Promise<unknown>;
  relay: Pick<HostToolRelay, 'updateCatalog' | 'waitForCatalogRefresh'>;
  tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  harnessId: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}): Promise<void> {
  void startPrompt();
  await refreshHostToolCatalog({
    relay,
    tools,
    harnessId,
    timeoutMs,
    abortSignal,
  });
}

export async function refreshHostToolCatalog({
  relay,
  tools,
  harnessId,
  timeoutMs,
  abortSignal,
}: {
  relay: Pick<HostToolRelay, 'updateCatalog' | 'waitForCatalogRefresh'>;
  tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  harnessId: string;
  timeoutMs: number;
  /*
   * Aborting the turn while its catalog is still loading must settle the wait
   * immediately: the caller cancels the prompt it dispatched, and waiting for
   * the refresh timeout would keep an abandoned ACP turn running.
   */
  abortSignal?: AbortSignal;
}): Promise<void> {
  const catalog = relay.updateCatalog({ tools });
  if (!catalog.changed && tools.length === 0) return;
  if (abortSignal?.aborted) throw abortSignal.reason;
  if (
    await waitForCatalogRefreshOrAbort({
      refresh: relay.waitForCatalogRefresh({
        revision: catalog.revision,
        timeoutMs,
      }),
      abortSignal,
    })
  ) {
    return;
  }
  throw new HarnessBridgeCapabilityUnsupportedError({
    harnessId,
    message:
      'The ACP agent did not load the active harness-owned MCP ' +
      `tool catalog to revision ${catalog.revision} before the next ` +
      'prompt, so host tools cannot be exposed safely.',
  });
}

/*
 * Races the relay's bounded refresh wait with the turn's abort signal. The
 * refresh promise always settles (it has its own timeout), so abandoning it on
 * abort cannot leak an unhandled rejection.
 */
async function waitForCatalogRefreshOrAbort({
  refresh,
  abortSignal,
}: {
  refresh: Promise<boolean>;
  abortSignal?: AbortSignal;
}): Promise<boolean> {
  if (abortSignal == null) return refresh;
  if (abortSignal.aborted) throw abortSignal.reason;
  return new Promise<boolean>((resolve, reject) => {
    const onAbort = () => reject(abortSignal.reason);
    abortSignal.addEventListener('abort', onAbort, { once: true });
    void refresh
      .then(refreshed => {
        abortSignal.removeEventListener('abort', onAbort);
        resolve(refreshed);
      })
      .catch(error => {
        abortSignal.removeEventListener('abort', onAbort);
        reject(error);
      });
  });
}
