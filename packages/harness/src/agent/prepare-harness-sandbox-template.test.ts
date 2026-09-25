import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import type {
  HarnessV1,
  HarnessV1Bootstrap,
  HarnessV1SandboxProvider,
} from '../v1';
import {
  prepareHarnessSandboxTemplate,
  prewarmHarness,
} from './prepare-harness-sandbox-template';

function makeHarness(options: { recipe?: HarnessV1Bootstrap } = {}): HarnessV1 {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'mock',
    builtinTools: {},
    ...(options.recipe != null
      ? { getBootstrap: vi.fn(async () => options.recipe!) }
      : {}),
    doStart: async () => {
      throw new Error('not used');
    },
  };
}

function makeSession(): {
  session: SandboxSession;
  run: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  writeTextFile: ReturnType<typeof vi.fn>;
  readTextFile: ReturnType<typeof vi.fn>;
} {
  const run = vi.fn(async (args: { command: string }) => {
    if (args.command === 'pwd') {
      return { exitCode: 0, stdout: '/work\n', stderr: '' };
    }
    if (args.command === 'printf "%s" "$HOME"') {
      return { exitCode: 0, stdout: '/home/agent', stderr: '' };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  });
  const stop = vi.fn(async () => {});
  const writeTextFile = vi.fn(async () => {});
  const readTextFile = vi.fn(async () => null);
  const session = {
    description: 'mock',
    run,
    stop,
    writeTextFile,
    readTextFile,
    restricted: () => session,
  } as unknown as SandboxSession & { stop: () => Promise<void> };
  return { session, run, stop, writeTextFile, readTextFile };
}

describe('prepareHarnessSandboxTemplate', () => {
  it('runs caller bootstrap through provider onFirstCreate and stops the session', async () => {
    const { session, stop } = makeSession();
    const createSession = vi.fn(
      async (
        opts: Parameters<HarnessV1SandboxProvider['createSession']>[0],
      ) => {
        await opts?.onFirstCreate?.(session, {});
        return session as never;
      },
    );
    const onSandboxBootstrap = vi.fn(async () => {});

    await prepareHarnessSandboxTemplate({
      harness: makeHarness(),
      sandboxProvider: {
        specificationVersion: 'harness-sandbox-v1',
        providerId: 'mock-sandbox',
        createSession,
      },
      sandboxConfig: {
        workDir: 'ai-sdk',
        bootstrapHash: 'repo-v1',
        onBootstrap: onSandboxBootstrap,
      },
    });

    expect(createSession.mock.calls[0]![0]).toEqual({
      abortSignal: undefined,
      identity: expect.stringMatching(/^[0-9a-f]{16}$/),
      onFirstCreate: expect.any(Function),
    });
    expect(onSandboxBootstrap).toHaveBeenCalledWith({
      session,
      workDir: '/work/ai-sdk',
      abortSignal: undefined,
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('keeps prewarmHarness as an alias for prepareHarnessSandboxTemplate', () => {
    expect(prewarmHarness).toBe(prepareHarnessSandboxTemplate);
  });

  it('applies the harness bootstrap recipe under the sandbox HOME, never the working directory', async () => {
    const { session, writeTextFile } = makeSession();
    const createSession = vi.fn(
      async (_opts: Parameters<HarnessV1SandboxProvider['createSession']>[0]) =>
        session as never,
    );
    const recipe: HarnessV1Bootstrap = {
      harnessId: 'mock',
      bootstrapDir: '.harness-bootstrap/mock',
      files: [{ path: '.harness-bootstrap/mock/bridge.mjs', content: 'x' }],
      commands: [],
    };

    await prepareHarnessSandboxTemplate({
      harness: makeHarness({ recipe }),
      sandboxProvider: {
        specificationVersion: 'harness-sandbox-v1',
        providerId: 'mock-sandbox',
        createSession,
      },
    });

    const writtenPaths = (
      writeTextFile.mock.calls as unknown as Array<[{ path: string }]>
    ).map(call => call[0].path);
    expect(writtenPaths).toContain(
      '/home/agent/.ai-sdk-harness/.harness-bootstrap/mock/bridge.mjs',
    );
  });
});
