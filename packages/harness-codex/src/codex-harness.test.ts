import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import { codex } from './codex-harness';

describe('codex adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = codex();
    expect(harness.harnessId).toBe('codex');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.builtinTools.map(t => t.nativeName)).toEqual([
      'shell',
      'file_edit',
      'web_search',
      'todo_list',
    ]);
  });

  it('throws HarnessCapabilityUnsupportedError when sandbox is missing', async () => {
    const harness = codex();
    await expect(harness.doStart({ sessionId: 's1' })).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
  });

  it('throws HarnessCapabilityUnsupportedError when sandbox lacks getPortUrl', async () => {
    const harness = codex();
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
