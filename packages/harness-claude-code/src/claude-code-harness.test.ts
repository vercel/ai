import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import { claudeCode } from './claude-code-harness';

describe('claudeCode adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = claudeCode();
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
    const harness = claudeCode();
    await expect(harness.doStart({ sessionId: 's1' })).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
  });

  it('throws HarnessCapabilityUnsupportedError when sandbox lacks getPortUrl', async () => {
    const harness = claudeCode();
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
