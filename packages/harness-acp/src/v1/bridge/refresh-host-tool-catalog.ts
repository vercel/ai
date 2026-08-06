import type { HarnessV1BridgeToolWire } from '@ai-sdk/harness';
import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import type { HostToolRelay } from './host-tool-relay';

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
