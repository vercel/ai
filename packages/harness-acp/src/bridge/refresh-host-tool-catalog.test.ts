import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { describe, expect, it, vi } from 'vitest';
import { refreshHostToolCatalog } from './refresh-host-tool-catalog';

describe('refreshHostToolCatalog', () => {
  it('waits when a non-empty catalog is unchanged but may not be loaded', async () => {
    const waitForCatalogRefresh = vi.fn(async () => true);

    await refreshHostToolCatalog({
      relay: {
        updateCatalog: () => ({ changed: false, revision: 4 }),
        waitForCatalogRefresh,
      },
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
      harnessId: 'generic-acp',
      timeoutMs: 100,
    });

    expect(waitForCatalogRefresh).toHaveBeenCalledWith({
      revision: 4,
      timeoutMs: 100,
    });
  });

  it('does not wait when an empty catalog is unchanged', async () => {
    const waitForCatalogRefresh = vi.fn(async () => true);

    await refreshHostToolCatalog({
      relay: {
        updateCatalog: () => ({ changed: false, revision: 4 }),
        waitForCatalogRefresh,
      },
      tools: [],
      harnessId: 'generic-acp',
      timeoutMs: 100,
    });

    expect(waitForCatalogRefresh).not.toHaveBeenCalled();
  });

  it('waits for a changed catalog revision', async () => {
    const waitForCatalogRefresh = vi.fn(async () => true);

    await refreshHostToolCatalog({
      relay: {
        updateCatalog: () => ({ changed: true, revision: 5 }),
        waitForCatalogRefresh,
      },
      tools: [],
      harnessId: 'generic-acp',
      timeoutMs: 100,
    });

    expect(waitForCatalogRefresh).toHaveBeenCalledWith({
      revision: 5,
      timeoutMs: 100,
    });
  });

  it('fails precisely when an implementation does not refresh', async () => {
    const promise = refreshHostToolCatalog({
      relay: {
        updateCatalog: () => ({ changed: true, revision: 6 }),
        waitForCatalogRefresh: async () => false,
      },
      tools: [],
      harnessId: 'generic-acp',
      timeoutMs: 100,
    });

    await expect(promise).rejects.toSatisfy(error => {
      expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        name: 'AI_HarnessCapabilityUnsupportedError',
        harnessId: 'generic-acp',
        message:
          'The ACP implementation did not load the active harness-owned MCP tool catalog to revision 6 before the next prompt, so host tools cannot be exposed safely.',
      });
      return true;
    });
  });
});
