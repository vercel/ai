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
}: {
  startPrompt: () => Promise<unknown>;
  relay: Pick<HostToolRelay, 'updateCatalog' | 'waitForCatalogRefresh'>;
  tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  harnessId: string;
  timeoutMs: number;
}): Promise<void> {
  void startPrompt();
  await refreshHostToolCatalog({
    relay,
    tools,
    harnessId,
    timeoutMs,
  });
}

export async function refreshHostToolCatalog({
  relay,
  tools,
  harnessId,
  timeoutMs,
}: {
  relay: Pick<HostToolRelay, 'updateCatalog' | 'waitForCatalogRefresh'>;
  tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  harnessId: string;
  timeoutMs: number;
}): Promise<void> {
  const catalog = relay.updateCatalog({ tools });
  if (!catalog.changed && tools.length === 0) return;
  if (
    await relay.waitForCatalogRefresh({
      revision: catalog.revision,
      timeoutMs,
    })
  ) {
    return;
  }
  throw new HarnessBridgeCapabilityUnsupportedError({
    harnessId,
    message:
      'The ACP implementation did not load the active harness-owned MCP ' +
      `tool catalog to revision ${catalog.revision} before the next ` +
      'prompt, so host tools cannot be exposed safely.',
  });
}
