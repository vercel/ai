import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import { createClaudeCode } from './claude-code-harness';

describe('createClaudeCode adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = createClaudeCode();
    expect(harness.harnessId).toBe('claude-code');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.builtinTools.map(t => t.nativeName)).toEqual([
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
    ]);
  });

  it('throws HarnessCapabilityUnsupportedError when no sandbox handle is provided', async () => {
    const harness = createClaudeCode();
    await expect(harness.doStart({ sessionId: 's1' })).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
  });

  it('throws HarnessCapabilityUnsupportedError when the handle exposes no ports', async () => {
    const harness = createClaudeCode();
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
