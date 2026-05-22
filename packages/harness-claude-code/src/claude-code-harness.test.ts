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

  it('throws HarnessCapabilityUnsupportedError when sandbox is missing', async () => {
    const harness = createClaudeCode();
    await expect(harness.doStart({ sessionId: 's1' })).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
  });

  it('throws HarnessCapabilityUnsupportedError when sandbox lacks getPortUrl', async () => {
    const harness = createClaudeCode();
    const sandbox = {
      description: 'fake',
      async runCommand() {
        return { exitCode: 0, stdout: '', stderr: '' };
      },
      async spawnCommand() {
        throw new Error('should not be reached');
      },
      async readFile() {
        return null;
      },
      async readBinaryFile() {
        return null;
      },
      async readTextFile() {
        return null;
      },
      async writeFile() {
        // noop
      },
      async writeBinaryFile() {
        // noop
      },
      async writeTextFile() {
        // noop
      },
    } as never;
    await expect(
      harness.doStart({ sessionId: 's1', sandbox }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });
});
