import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import type { HarnessV1Bootstrap } from '../../v1';
import {
  BOOTSTRAP_SCHEMA_VERSION,
  applyBootstrapRecipe,
  bootstrapMarkerPath,
  hashHarnessBootstrap,
} from './bootstrap-recipe';

const baseRecipe: HarnessV1Bootstrap = {
  harnessId: 'demo',
  bootstrapDir: '/tmp/harness/demo',
  files: [
    { path: '/tmp/harness/demo/a.txt', content: 'one' },
    { path: '/tmp/harness/demo/b.txt', content: 'two' },
  ],
  commands: [{ command: 'echo first' }, { command: 'echo second' }],
};
const defaultWorkingDirectory = '/work';

describe('hashHarnessBootstrap', () => {
  it('produces a deterministic 16-char hex id for the same recipe', async () => {
    const a = await hashHarnessBootstrap(baseRecipe);
    const b = await hashHarnessBootstrap(baseRecipe);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is unaffected by file ordering in the recipe', async () => {
    const reordered: HarnessV1Bootstrap = {
      ...baseRecipe,
      files: [...baseRecipe.files].reverse(),
    };
    expect(await hashHarnessBootstrap(baseRecipe)).toBe(
      await hashHarnessBootstrap(reordered),
    );
  });

  it('changes when a file content changes', async () => {
    const altered: HarnessV1Bootstrap = {
      ...baseRecipe,
      files: [
        { path: '/tmp/harness/demo/a.txt', content: 'one!' },
        baseRecipe.files[1],
      ],
    };
    expect(await hashHarnessBootstrap(altered)).not.toBe(
      await hashHarnessBootstrap(baseRecipe),
    );
  });

  it('changes when a command changes', async () => {
    const altered: HarnessV1Bootstrap = {
      ...baseRecipe,
      commands: [{ command: 'echo different' }],
    };
    expect(await hashHarnessBootstrap(altered)).not.toBe(
      await hashHarnessBootstrap(baseRecipe),
    );
  });

  it('changes when harnessId changes', async () => {
    const altered: HarnessV1Bootstrap = { ...baseRecipe, harnessId: 'other' };
    expect(await hashHarnessBootstrap(altered)).not.toBe(
      await hashHarnessBootstrap(baseRecipe),
    );
  });

  it('changes when bootstrapDir changes', async () => {
    const altered: HarnessV1Bootstrap = {
      ...baseRecipe,
      bootstrapDir: '/tmp/other',
    };
    expect(await hashHarnessBootstrap(altered)).not.toBe(
      await hashHarnessBootstrap(baseRecipe),
    );
  });
});

describe('bootstrapMarkerPath', () => {
  it('embeds the identity in the filename under bootstrapDir', () => {
    expect(
      bootstrapMarkerPath({
        recipe: baseRecipe,
        identity: 'abc1234567890def',
        defaultWorkingDirectory,
      }),
    ).toBe('/tmp/harness/demo/.bootstrap-abc1234567890def.ok');
  });

  it('resolves a relative bootstrapDir against the default working directory', () => {
    expect(
      bootstrapMarkerPath({
        recipe: {
          ...baseRecipe,
          bootstrapDir: '.harness-bootstrap/demo',
        },
        identity: 'abc1234567890def',
        defaultWorkingDirectory,
      }),
    ).toBe('/work/.harness-bootstrap/demo/.bootstrap-abc1234567890def.ok');
  });
});

describe('applyBootstrapRecipe', () => {
  const identity = 'idtest1234567890';

  function makeMockSession(opts?: {
    markerExists?: boolean;
    directoryExitCode?: number;
    commandExitCode?: number;
    runFailureMessage?: string;
  }): {
    session: SandboxSession;
    readTextFile: ReturnType<typeof vi.fn>;
    writeTextFile: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  } {
    const markerPath = bootstrapMarkerPath({
      recipe: baseRecipe,
      identity,
      defaultWorkingDirectory,
    });
    const readTextFile = vi.fn(async (args: { path: string }) => {
      if (args.path === markerPath && opts?.markerExists) return '';
      return null;
    });
    const writeTextFile = vi.fn(async (_args: { path: string }) => {});
    const run = vi.fn(
      async (args: {
        command: string;
        workingDirectory?: string;
        env?: Record<string, string>;
      }) => {
        const isDirectoryCreation =
          args.command === 'mkdir -p "$BOOTSTRAP_DIR"';
        return {
          exitCode: isDirectoryCreation
            ? (opts?.directoryExitCode ?? 0)
            : (opts?.commandExitCode ?? 0),
          stdout: 'ok',
          stderr: opts?.runFailureMessage ?? '',
        };
      },
    );
    const session = {
      description: 'mock',
      readTextFile,
      writeTextFile,
      run,
    } as unknown as SandboxSession;
    return { session, readTextFile, writeTextFile, run };
  }

  it('skips when the marker file is present', async () => {
    const { session, readTextFile, writeTextFile, run } = makeMockSession({
      markerExists: true,
    });
    await applyBootstrapRecipe({
      session,
      recipe: baseRecipe,
      identity,
      defaultWorkingDirectory,
    });
    expect(readTextFile).toHaveBeenCalledTimes(1);
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('creates the bootstrap directory, writes files, runs commands there, and writes the marker', async () => {
    const { session, writeTextFile, run } = makeMockSession();
    await applyBootstrapRecipe({
      session,
      recipe: baseRecipe,
      identity,
      defaultWorkingDirectory,
    });
    expect(writeTextFile).toHaveBeenCalledTimes(
      baseRecipe.files.length + 1, // recipe files + marker
    );
    expect(run).toHaveBeenCalledTimes(baseRecipe.commands.length + 1);
    expect(run).toHaveBeenNthCalledWith(1, {
      command: 'mkdir -p "$BOOTSTRAP_DIR"',
      workingDirectory: defaultWorkingDirectory,
      env: { BOOTSTRAP_DIR: '/tmp/harness/demo' },
      abortSignal: undefined,
    });
    expect(run.mock.calls.map(([args]) => args.workingDirectory)).toEqual([
      defaultWorkingDirectory,
      '/tmp/harness/demo',
      '/tmp/harness/demo',
    ]);
    expect(run.mock.invocationCallOrder[0]!).toBeLessThan(
      writeTextFile.mock.invocationCallOrder[0]!,
    );
    const lastWrite = writeTextFile.mock.calls.at(-1)![0];
    expect(lastWrite.path).toBe(
      bootstrapMarkerPath({
        recipe: baseRecipe,
        identity,
        defaultWorkingDirectory,
      }),
    );
  });

  it('resolves relative paths and runs commands from the bootstrap directory', async () => {
    const relativeRecipe: HarnessV1Bootstrap = {
      harnessId: 'demo',
      bootstrapDir: '.harness-bootstrap/demo',
      files: [
        {
          path: '.harness-bootstrap/demo/file.txt',
          content: 'content',
        },
      ],
      commands: [{ command: 'echo first' }, { command: 'echo second' }],
    };
    const { session, readTextFile, writeTextFile, run } = makeMockSession();

    await applyBootstrapRecipe({
      session,
      recipe: relativeRecipe,
      identity,
      defaultWorkingDirectory,
    });

    expect(readTextFile).toHaveBeenCalledWith({
      path: '/work/.harness-bootstrap/demo/.bootstrap-idtest1234567890.ok',
      abortSignal: undefined,
    });
    expect(writeTextFile.mock.calls.map(([args]) => args.path)).toEqual([
      '/work/.harness-bootstrap/demo/file.txt',
      '/work/.harness-bootstrap/demo/.bootstrap-idtest1234567890.ok',
    ]);
    expect(run.mock.calls.map(([args]) => args.workingDirectory)).toEqual([
      '/work',
      '/work/.harness-bootstrap/demo',
      '/work/.harness-bootstrap/demo',
    ]);
  });

  it('throws when a command exits non-zero and skips the marker write', async () => {
    const { session, writeTextFile, run } = makeMockSession({
      commandExitCode: 7,
      runFailureMessage: 'boom',
    });
    await expect(
      applyBootstrapRecipe({
        session,
        recipe: baseRecipe,
        identity,
        defaultWorkingDirectory,
      }),
    ).rejects.toThrow(/Bootstrap command failed.*exit 7.*boom/s);
    expect(run).toHaveBeenCalledTimes(2);
    const markerWrites = writeTextFile.mock.calls.filter(
      ([args]) =>
        args.path ===
        bootstrapMarkerPath({
          recipe: baseRecipe,
          identity,
          defaultWorkingDirectory,
        }),
    );
    expect(markerWrites).toHaveLength(0);
  });

  it('stops before writing files when bootstrap directory creation fails', async () => {
    const { session, writeTextFile, run } = makeMockSession({
      directoryExitCode: 9,
      runFailureMessage: 'mkdir failed',
    });

    await expect(
      applyBootstrapRecipe({
        session,
        recipe: baseRecipe,
        identity,
        defaultWorkingDirectory,
      }),
    ).rejects.toThrow(
      /Failed to create bootstrap directory.*exit 9.*mkdir failed/s,
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});

describe('BOOTSTRAP_SCHEMA_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(BOOTSTRAP_SCHEMA_VERSION)).toBe(true);
    expect(BOOTSTRAP_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
