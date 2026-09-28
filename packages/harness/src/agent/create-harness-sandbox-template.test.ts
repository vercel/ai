import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import type { HarnessV1, HarnessV1Bootstrap } from '../v1';
import { createHarnessSandboxTemplate } from './create-harness-sandbox-template';
import { prepareSandboxForHarness } from './prepare-sandbox-for-harness';

function harness(harnessId: string, command?: string): HarnessV1 {
  const recipe: HarnessV1Bootstrap = {
    harnessId,
    bootstrapDir: `.bootstrap/${harnessId}`,
    files: [],
    commands: command == null ? [] : [{ command }],
  };
  return {
    specificationVersion: 'harness-v1',
    harnessId,
    builtinTools: {},
    getBootstrap: vi.fn(async () => recipe),
    doStart: async () => {
      throw new Error('unused');
    },
  };
}

function sandbox() {
  const files = new Map<string, string>();
  const run = vi.fn(async ({ command }: { command: string }) => ({
    exitCode: 0,
    stdout:
      command === 'printf "%s" "$HOME"'
        ? '/home/agent'
        : command === 'pwd'
          ? '/work\n'
          : '',
    stderr: '',
  }));
  const session = {
    run,
    readTextFile: vi.fn(
      async ({ path }: { path: string }) => files.get(path) ?? null,
    ),
    writeTextFile: vi.fn(
      async ({ path, content }: { path: string; content: string }) => {
        files.set(path, content);
      },
    ),
  } as unknown as SandboxSession;
  return { session, run, files };
}

describe('createHarnessSandboxTemplate', () => {
  it('shares manual aggregate identity, sorts harnesses, and captures recipes', async () => {
    const alpha = harness('alpha', 'echo alpha');
    const beta = harness('beta', 'echo beta');
    const settings = {
      workDir: 'repo/../app',
      bootstrapHash: 'tools-v1',
      onBootstrap: vi.fn(async () => {}),
    };
    const template = await createHarnessSandboxTemplate({
      harnesses: [beta, alpha],
      sandboxConfig: settings,
    });
    const reversed = await createHarnessSandboxTemplate({
      harnesses: [alpha, beta],
      sandboxConfig: settings,
    });
    const manual = await prepareSandboxForHarness({
      session: sandbox().session,
      harnesses: [alpha, beta],
      sandboxConfig: settings,
    });
    expect(template?.identity).toBe(manual.identity);
    expect(reversed?.identity).toBe(template?.identity);

    const { session, run } = sandbox();
    await template?.prepare({ session });
    await template?.prepare({ session });
    expect(
      run.mock.calls
        .map(([args]) => args.command)
        .filter(command => command.startsWith('echo')),
    ).toEqual(['echo alpha', 'echo beta']);
    expect(settings.onBootstrap).toHaveBeenCalledTimes(2);
  });

  it('uses the last adapter for a repeated ID and resolves recipes only during creation', async () => {
    const first = harness('alpha', 'first');
    const last = harness('alpha', 'last');
    const template = await createHarnessSandboxTemplate({
      harnesses: [first, last],
    });
    const { session, run } = sandbox();
    await template?.prepare({ session });
    expect(first.getBootstrap).not.toHaveBeenCalled();
    expect(last.getBootstrap).toHaveBeenCalledOnce();
    expect(run.mock.calls.map(([args]) => args.command)).toContain('last');
  });

  it('rejects empty lists and unpaired hashes, and returns undefined without work', async () => {
    await expect(
      createHarnessSandboxTemplate({ harnesses: [] }),
    ).rejects.toThrow('at least one harness');
    await expect(
      createHarnessSandboxTemplate({
        harnesses: [harness('alpha')],
        sandboxConfig: { onBootstrap: async () => {} },
      }),
    ).rejects.toThrow('must be provided together');
    const empty = { ...harness('empty'), getBootstrap: undefined };
    expect(
      await createHarnessSandboxTemplate({
        harnesses: [empty],
        sandboxConfig: { workDir: 'repo' },
      }),
    ).toBeUndefined();
  });
});
