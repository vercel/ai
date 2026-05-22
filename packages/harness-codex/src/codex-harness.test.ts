import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import { createCodex } from './codex-harness';

describe('createCodex adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = createCodex();
    expect(harness.harnessId).toBe('codex');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.builtinTools.map(t => t.nativeName)).toEqual([
      'shell',
      'file_edit',
      'web_search',
      'todo_list',
    ]);
  });

  it('throws HarnessCapabilityUnsupportedError when no sandbox handle is provided', async () => {
    const harness = createCodex();
    await expect(harness.doStart({ sessionId: 's1' })).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
  });

  it('throws HarnessCapabilityUnsupportedError when the handle exposes no ports', async () => {
    const harness = createCodex();
    const sandboxHandle = {
      session: {} as never,
      ports: [] as ReadonlyArray<number>,
      async getPortUrl() {
        return '';
      },
      async stop() {},
    };
    await expect(
      harness.doStart({ sessionId: 's1', sandboxHandle }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });
});
