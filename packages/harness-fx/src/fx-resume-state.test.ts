import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { createFxStateStore, type FxStoredState } from './fx-resume-state';

function createSandbox() {
  const files = new Map<string, string>();
  const run = vi.fn(async ({ command }: { command: string }) => {
    if (command.includes('"$HOME"')) {
      return {
        exitCode: 0,
        stdout: Buffer.from('/sandbox/home').toString('base64'),
        stderr: '',
      };
    }
    if (command.startsWith('mv --')) {
      const paths = [...command.matchAll(/'([^']+)'/g)].map(match => match[1]);
      files.set(paths[1], files.get(paths[0])!);
      files.delete(paths[0]);
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  });
  const readTextFile = vi.fn(
    async ({ path }: { path: string }) => files.get(path) ?? null,
  );
  const writeTextFile = vi.fn(
    async ({ path, content }: { path: string; content: string }) => {
      files.set(path, content);
    },
  );
  const sandbox = {
    run,
    readTextFile,
    writeTextFile,
  } as unknown as SandboxSession;
  return { sandbox, files, run, readTextFile, writeTextFile };
}

const state: FxStoredState = {
  version: 1,
  sdkVersion: '0.0.14',
  checkpoint: 'AQID',
};

describe('createFxStateStore', () => {
  it.each([
    { sessionId: 'session-1', segment: 'session-1' },
    { sessionId: '../unsafe/session-id', segment: '..%2Funsafe%2Fsession-id' },
    { sessionId: 'a/b', segment: 'a%2Fb' },
    { sessionId: 'a%2Fb', segment: 'a%252Fb' },
    { sessionId: '..', segment: '%2E%2E' },
    { sessionId: '', segment: '%' },
  ])(
    'round-trips $sessionId through its session directory',
    async ({ sessionId, segment }) => {
      const { sandbox, files, run, readTextFile, writeTextFile } =
        createSandbox();
      const options = { sandbox, sessionId, workDir: '/sandbox/work' };
      const store = await createFxStateStore(options);
      const directory = `/sandbox/home/.ai-sdk-harness/.agent-runs/${segment}/fx`;
      const filePath = `${directory}/state.json`;

      expect(run).toHaveBeenCalledWith({
        command: `mkdir -p -- '${directory}' && chmod 700 -- '${directory}'`,
      });
      expect(store.fileName).toBe('state.json');
      await store.save(state);
      await store.flush();

      expect(writeTextFile).toHaveBeenCalledExactlyOnceWith({
        path: `${filePath}.tmp`,
        content: JSON.stringify(state),
      });
      expect(run).toHaveBeenCalledWith({
        command: `mv -- '${filePath}.tmp' '${filePath}'`,
      });
      expect([...files.keys()]).toEqual([filePath]);

      const restored = await createFxStateStore(options);
      expect(await restored.load()).toEqual(state);
      expect(readTextFile).toHaveBeenCalledExactlyOnceWith({ path: filePath });
    },
  );

  it('keeps different session IDs in separate directories', async () => {
    const { sandbox, files } = createSandbox();
    for (const sessionId of ['a/b', 'a%2Fb']) {
      const store = await createFxStateStore({
        sandbox,
        sessionId,
        workDir: '/sandbox/work',
      });
      await store.save(state);
    }

    expect([...files.keys()]).toEqual([
      '/sandbox/home/.ai-sdk-harness/.agent-runs/a%2Fb/fx/state.json',
      '/sandbox/home/.ai-sdk-harness/.agent-runs/a%252Fb/fx/state.json',
    ]);
  });

  it.each([
    '/sandbox/home',
    '/sandbox/home/.ai-sdk-harness/.agent-runs/session-1',
    '/sandbox/home/.ai-sdk-harness/.agent-runs/session-1/fx',
  ])('rejects private state inside or equal to workspace %s', async workDir => {
    const { sandbox, run } = createSandbox();
    await expect(
      createFxStateStore({ sandbox, sessionId: 'session-1', workDir }),
    ).rejects.toThrow('fx private state must be outside sessionWorkDir.');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('uses the lifecycle state filename for both reads and writes', async () => {
    const { sandbox, files } = createSandbox();
    const store = await createFxStateStore({
      sandbox,
      sessionId: 'session-1',
      workDir: '/sandbox/work',
      stateFileName: 'checkpoint.json',
    });
    await store.save(state);

    expect(store.fileName).toBe('checkpoint.json');
    expect([...files.keys()]).toEqual([
      '/sandbox/home/.ai-sdk-harness/.agent-runs/session-1/fx/checkpoint.json',
    ]);
    expect(await store.load()).toEqual(state);
  });

  it('rejects missing saved state', async () => {
    const { sandbox } = createSandbox();
    const store = await createFxStateStore({
      sandbox,
      sessionId: 'session-1',
      workDir: '/sandbox/work',
    });
    await expect(store.load()).rejects.toThrow(
      'Cannot resume fx: the saved state file is missing.',
    );
  });

  it.each(['not json', '{"version":2,"sdkVersion":"0.0.14"}'])(
    'rejects invalid or incompatible state %s',
    async content => {
      const { sandbox, files } = createSandbox();
      files.set(
        '/sandbox/home/.ai-sdk-harness/.agent-runs/session-1/fx/state.json',
        content,
      );
      const store = await createFxStateStore({
        sandbox,
        sessionId: 'session-1',
        workDir: '/sandbox/work',
      });
      await expect(store.load()).rejects.toThrow(
        'Cannot resume fx: the saved state is invalid or incompatible.',
      );
    },
  );
});
