import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { mkdtemp, readFile, realpath } from 'node:fs/promises';
import type * as NodeFsModule from 'node:fs';
import { createRequire } from 'node:module';
import type * as NodeModuleModule from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, parse } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLocalWorkspaceSandbox,
  localWorkspace,
  LocalWorkspaceSandboxProvider,
} from './local-workspace-sandbox';

const sessionsToStop: Array<{ stop: () => PromiseLike<void> }> = [];

afterEach(async () => {
  while (sessionsToStop.length > 0) {
    await sessionsToStop.pop()?.stop();
  }
});

async function createTempProject(name = 'myapp') {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'lws-'));
  const projectPath = join(root, name);
  mkdirSync(projectPath, { recursive: true });
  return { root, projectPath };
}

async function startSession(
  settings: Parameters<typeof createLocalWorkspaceSandbox>[0],
  options?: Parameters<
    ReturnType<typeof createLocalWorkspaceSandbox>['createSession']
  >[0],
) {
  const provider = createLocalWorkspaceSandbox(settings);
  const session = await provider.createSession(options);
  sessionsToStop.push(session);
  return session;
}

describe('createLocalWorkspaceSandbox', () => {
  it('returns a LocalWorkspaceSandboxProvider with the conventional id', () => {
    const provider = createLocalWorkspaceSandbox({ path: '/tmp/does-not-yet' });
    expect(provider).toBeInstanceOf(LocalWorkspaceSandboxProvider);
    expect(provider.providerId).toBe('local-workspace-sandbox');
    expect(provider.specificationVersion).toBe('harness-sandbox-v1');
  });

  it('does no filesystem work until createSession is called', async () => {
    const { root } = await createTempProject();
    const projectPath = join(root, 'not-created-yet');
    createLocalWorkspaceSandbox({ path: projectPath });
    expect(existsSync(projectPath)).toBe(false);
  });

  it('creates the project directory on createSession', async () => {
    const { root } = await createTempProject();
    const projectPath = join(root, 'fresh');
    await startSession({ path: projectPath });
    expect(existsSync(projectPath)).toBe(true);
  });

  describe('constructor guards', () => {
    it('refuses the filesystem root', () => {
      const root = parse(process.cwd()).root;
      expect(() => createLocalWorkspaceSandbox({ path: root })).toThrow(
        /must not be the filesystem root/,
      );
    });

    it('refuses the home directory', () => {
      expect(() => createLocalWorkspaceSandbox({ path: homedir() })).toThrow(
        /must not be the home directory/,
      );
    });

    // The constructor cannot follow symlinks, because the provider contract
    // forbids I/O at construction. `createSession` re-checks once the path is
    // resolved, otherwise a symlink walks straight past the guard.
    it('refuses a symlink pointing at the filesystem root', async () => {
      const { root } = await createTempProject();
      const link = join(root, 'link-to-root');
      symlinkSync(parse(process.cwd()).root, link);

      const provider = createLocalWorkspaceSandbox({ path: link });
      await expect(provider.createSession()).rejects.toThrow(
        /must not be the filesystem root/,
      );
    });

    it('refuses a symlink pointing at the home directory', async () => {
      const { root } = await createTempProject();
      const link = join(root, 'link-to-home');
      symlinkSync(homedir(), link);

      const provider = createLocalWorkspaceSandbox({ path: link });
      await expect(provider.createSession()).rejects.toThrow(
        /must not be the home directory/,
      );
    });

    it('names both spellings when a symlink is rejected', async () => {
      const { root } = await createTempProject();
      const link = join(root, 'link-home-2');
      symlinkSync(homedir(), link);

      await expect(
        createLocalWorkspaceSandbox({ path: link }).createSession(),
      ).rejects.toThrow(new RegExp(`resolved from .*${'link-home-2'}`));
    });
  });
});

describe('localWorkspace', () => {
  it('returns a provider and the matching workDir', () => {
    const workspace = localWorkspace({ path: '/Users/me/repos/myapp' });
    expect(workspace.sandbox).toBeInstanceOf(LocalWorkspaceSandboxProvider);
    expect(workspace.sandboxConfig).toEqual({ workDir: 'myapp' });
  });

  it('normalises trailing slashes and relative segments', () => {
    expect(
      localWorkspace({ path: '/Users/me/repos/myapp/' }).sandboxConfig.workDir,
    ).toBe('myapp');
    expect(
      localWorkspace({ path: '/Users/me/repos/other/../myapp' }).sandboxConfig
        .workDir,
    ).toBe('myapp');
  });

  // The reason the helper exists: whatever spelling of `path` the caller uses,
  // the returned workDir names the directory the provider actually enters.
  // A mismatch would silently run the harness in an empty sibling directory.
  it('agrees with the directory the provider actually roots at', async () => {
    const { projectPath } = await createTempProject();
    for (const spelling of [
      projectPath,
      `${projectPath}/`,
      join(projectPath, 'sub', '..'),
    ]) {
      const { sandbox, sandboxConfig } = localWorkspace({ path: spelling });
      const session = await sandbox.createSession();
      sessionsToStop.push(session);
      expect(join(session.defaultWorkingDirectory, sandboxConfig.workDir)).toBe(
        projectPath,
      );
    }
  });

  // Documents why the README tells callers to assign `sandbox` and
  // `sandboxConfig` explicitly instead of spreading. Spreading looks tidier
  // but any later `sandboxConfig` key silently replaces the whole object,
  // dropping `workDir` and reintroducing the empty-sibling-directory failure.
  it('loses workDir if spread and then overridden, which is why we do not document that', () => {
    const workspace = localWorkspace({ path: '/Users/me/repos/myapp' });

    const spreadThenOverridden = {
      ...workspace,
      sandboxConfig: { onSession: () => {} },
    };
    expect(
      (spreadThenOverridden.sandboxConfig as { workDir?: string }).workDir,
    ).toBeUndefined();

    const merged = {
      sandbox: workspace.sandbox,
      sandboxConfig: { ...workspace.sandboxConfig, onSession: () => {} },
    };
    expect(merged.sandboxConfig.workDir).toBe('myapp');
  });

  it('forwards the remaining settings to the provider', async () => {
    const { projectPath } = await createTempProject();
    const { sandbox } = localWorkspace({ path: projectPath, portCount: 2 });
    const session = await sandbox.createSession();
    sessionsToStop.push(session);
    expect(session.ports).toHaveLength(2);
  });
});

describe('working directory rooting', () => {
  it('roots defaultWorkingDirectory at the project parent, not the project', async () => {
    const { root, projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    expect(session.defaultWorkingDirectory).toBe(root);
    expect(session.defaultWorkingDirectory).toBe(dirname(projectPath));
    expect(localWorkspace({ path: projectPath }).sandboxConfig.workDir).toBe(
      basename(projectPath),
    );
  });

  // Invariant 1. Adapters compare a spawned process's `pwd` against
  // `defaultWorkingDirectory`; on macOS /tmp -> /private/tmp, so a raw
  // `dirname()` would not match.
  it('resolves symlinked roots so a spawned pwd matches defaultWorkingDirectory', async () => {
    const { root, projectPath } = await createTempProject();
    const linkRoot = `${root}-link`;
    symlinkSync(root, linkRoot);

    const session = await startSession({
      path: join(linkRoot, basename(projectPath)),
    });

    expect(session.defaultWorkingDirectory).toBe(root);

    const { stdout, exitCode } = await session.run({ command: 'pwd -P' });
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(session.defaultWorkingDirectory);
  });

  // Invariant 3. Adapter bootstrap recipes use a relative bootstrapDir
  // (`.harness-bootstrap/<harnessId>`) resolved against
  // `defaultWorkingDirectory`, so it lands beside the project, never inside it.
  it('places a relative bootstrap dir beside the project, not inside it', async () => {
    const { root, projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    await session.writeTextFile({
      path: '.harness-bootstrap/claude-code/package.json',
      content: '{}',
    });

    expect(
      existsSync(join(root, '.harness-bootstrap/claude-code/package.json')),
    ).toBe(true);
    expect(existsSync(join(projectPath, '.harness-bootstrap'))).toBe(false);
  });
});

describe('file operations', () => {
  it('round-trips text and resolves relative paths against the sandbox root', async () => {
    const { root, projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    await session.writeTextFile({ path: 'myapp/hello.txt', content: 'hi' });

    expect(await readFile(join(projectPath, 'hello.txt'), 'utf8')).toBe('hi');
    expect(await session.readTextFile({ path: 'myapp/hello.txt' })).toBe('hi');
    expect(
      await session.readTextFile({ path: join(root, 'myapp/hello.txt') }),
    ).toBe('hi');
  });

  it('creates parent directories on write', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    await session.writeTextFile({ path: 'myapp/a/b/c.txt', content: 'deep' });
    expect(await readFile(join(projectPath, 'a/b/c.txt'), 'utf8')).toBe('deep');
  });

  it('resolves to null for a missing file, on every read variant', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    expect(await session.readTextFile({ path: 'nope.txt' })).toBeNull();
    expect(await session.readBinaryFile({ path: 'nope.txt' })).toBeNull();
    expect(await session.readFile({ path: 'nope.txt' })).toBeNull();
  });

  it('applies 1-based inclusive line ranges', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    await session.writeTextFile({
      path: 'myapp/lines.txt',
      content: 'one\ntwo\nthree\nfour',
    });

    expect(
      await session.readTextFile({
        path: 'myapp/lines.txt',
        startLine: 2,
        endLine: 3,
      }),
    ).toBe('two\nthree');
    // endLine past EOF reads through EOF without error.
    expect(
      await session.readTextFile({
        path: 'myapp/lines.txt',
        startLine: 3,
        endLine: 99,
      }),
    ).toBe('three\nfour');
  });

  it('round-trips binary content and streams', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    const bytes = new Uint8Array([0, 1, 2, 250]);

    await session.writeBinaryFile({ path: 'myapp/bin', content: bytes });
    expect(await session.readBinaryFile({ path: 'myapp/bin' })).toEqual(bytes);

    const stream = await session.readFile({ path: 'myapp/bin' });
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes));
  });

  // Invariant 2. Pi installs a global node:fs patch via syncBuiltinESMExports.
  // Because this package destructures its bindings at module load, writes must
  // still hit the real disk after the namespace is mutated.
  it('is immune to a node:fs monkey-patch installed after import', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    const require = createRequire(import.meta.url);
    const fsModule = require('node:fs') as typeof NodeFsModule;
    const { syncBuiltinESMExports } =
      require('node:module') as typeof NodeModuleModule;

    const realWriteFile = fsModule.promises.writeFile;
    let hijacked = 0;
    // Exactly Pi's shape: replace the binding, then republish the ESM view.
    (fsModule.promises as { writeFile: unknown }).writeFile = async () => {
      hijacked++;
    };
    syncBuiltinESMExports();

    try {
      await session.writeTextFile({
        path: 'myapp/REL.md',
        content: 'must reach disk',
      });
    } finally {
      (fsModule.promises as { writeFile: unknown }).writeFile = realWriteFile;
      syncBuiltinESMExports();
    }

    expect(hijacked).toBe(0);
    expect(readFileSync(join(projectPath, 'REL.md'), 'utf8')).toBe(
      'must reach disk',
    );
  });
});

describe('processes', () => {
  it('returns exit codes, stdout and stderr from run', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    const ok = await session.run({ command: 'echo out; echo err >&2' });
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout.trim()).toBe('out');
    expect(ok.stderr.trim()).toBe('err');

    const failed = await session.run({ command: 'exit 3' });
    expect(failed.exitCode).toBe(3);
  });

  it('runs in a workingDirectory relative to the sandbox root', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    const { stdout } = await session.run({
      command: 'pwd -P',
      workingDirectory: 'myapp',
    });
    expect(stdout.trim()).toBe(projectPath);
  });

  it('merges the inherited environment with settings.env and per-call env', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({
      path: projectPath,
      env: { FROM_SETTINGS: 'settings', OVERRIDDEN: 'settings' },
    });

    const { stdout } = await session.run({
      command: 'echo "$FROM_SETTINGS|$OVERRIDDEN|${PATH:+has-path}"',
      env: { OVERRIDDEN: 'call' },
    });
    expect(stdout.trim()).toBe('settings|call|has-path');
  });

  it('streams stdout incrementally from spawn', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    const child = await session.spawn({
      command: 'echo first; sleep 0.05; echo second',
    });
    const decoder = new TextDecoder();
    let text = '';
    for await (const chunk of child.stdout as unknown as AsyncIterable<Uint8Array>) {
      text += decoder.decode(chunk, { stream: true });
    }
    expect(await child.wait()).toEqual({ exitCode: 0 });
    expect(text.split('\n').filter(Boolean)).toEqual(['first', 'second']);
  });

  it('kills the process when abortSignal fires', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    const controller = new AbortController();
    const child = await session.spawn({
      command: 'sleep 30',
      abortSignal: controller.signal,
    });
    controller.abort();

    const { exitCode } = await child.wait();
    expect(exitCode).not.toBe(0);
  });

  it('rejects a spawn whose abortSignal is already aborted', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    await expect(
      session.run({ command: 'echo x', abortSignal: AbortSignal.abort() }),
    ).rejects.toThrow();
  });

  // Invariant 5. Bridges spawn CLIs that spawn more processes, so stop() must
  // reap the whole tree, not just the direct child.
  it('kills the entire process tree on stop', async () => {
    const { projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });
    const session = await provider.createSession();

    const marker = join(projectPath, 'grandchild.pid');
    await session.spawn({
      command: `bash -c 'echo $$ > ${marker}; sleep 30' & sleep 30`,
    });

    // Wait for the grandchild to record its pid.
    for (let attempt = 0; attempt < 50 && !existsSync(marker); attempt++) {
      await new Promise(done => setTimeout(done, 20));
    }
    const grandchildPid = Number(readFileSync(marker, 'utf8').trim());
    expect(grandchildPid).toBeGreaterThan(0);
    expect(isProcessAlive(grandchildPid)).toBe(true);

    await session.stop();
    await new Promise(done => setTimeout(done, 100));

    expect(isProcessAlive(grandchildPid)).toBe(false);
  });

  it('is idempotent on stop and destroy', async () => {
    const { projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });
    const session = await provider.createSession();
    await session.stop();
    await session.stop();
    await session.destroy?.();
  });
});

describe('ports', () => {
  it('allocates one loopback port by default and resolves URLs for it', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    expect(session.ports).toHaveLength(1);
    const [port] = session.ports;
    expect(port).toBeGreaterThan(0);

    expect(await session.getPortUrl({ port, protocol: 'ws' })).toBe(
      `ws://127.0.0.1:${port}`,
    );
    expect(await session.getPortUrl({ port })).toBe(`http://127.0.0.1:${port}`);
  });

  it('allocates distinct ports when portCount > 1', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath, portCount: 3 });
    expect(new Set(session.ports).size).toBe(3);
  });

  // `ports` is what was allocated for the bridge to bind, not a list of what is
  // addressable. Rejecting anything else breaks reattach: a detached bridge's
  // persisted port is never in the resumed session's fresh pool, adapters read
  // the failure as "bridge unreachable", and they silently respawn and orphan
  // the original.
  it('resolves a URL for a port outside the pool, so reattach can work', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    expect(session.ports).not.toContain(54_321);
    expect(await session.getPortUrl({ port: 54_321, protocol: 'ws' })).toBe(
      'ws://127.0.0.1:54321',
    );
  });

  it('resolves a port from a previous session, as reattach does', async () => {
    const { projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });

    const first = await provider.createSession();
    sessionsToStop.push(first);
    const detachedPort = first.ports[0];
    await first.stop();

    const resumed = await provider.resumeSession?.({ sessionId: 'resumed' });
    expect(resumed).toBeDefined();
    sessionsToStop.push(resumed!);

    // Fresh pool, but the persisted port still resolves.
    expect(resumed!.ports).not.toContain(detachedPort);
    expect(
      await resumed!.getPortUrl({ port: detachedPort, protocol: 'ws' }),
    ).toBe(`ws://127.0.0.1:${detachedPort}`);
  });

  it('omits setNetworkPolicy and setPorts rather than stubbing them', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    expect(session.setNetworkPolicy).toBeUndefined();
    expect(session.setPorts).toBeUndefined();
  });
});

describe('restricted()', () => {
  it('exposes the basic surface and hides the infra surface', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    const restricted = session.restricted();

    expect(typeof restricted.readTextFile).toBe('function');
    expect(typeof restricted.run).toBe('function');
    expect((restricted as Record<string, unknown>).stop).toBeUndefined();
    expect((restricted as Record<string, unknown>).getPortUrl).toBeUndefined();
    expect(
      (restricted as Record<string, unknown>).setNetworkPolicy,
    ).toBeUndefined();
  });

  it('points at the same underlying resource', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    await session.restricted().writeTextFile({
      path: 'myapp/from-restricted.txt',
      content: 'same box',
    });
    expect(
      await session.readTextFile({ path: 'myapp/from-restricted.txt' }),
    ).toBe('same box');
  });
});

describe('onFirstCreate', () => {
  it('runs once per identity and is skipped on later sessions', async () => {
    const { projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });

    let calls = 0;
    const onFirstCreate = async () => {
      calls++;
    };

    const first = await provider.createSession({
      identity: 'abc123',
      onFirstCreate,
    });
    sessionsToStop.push(first);
    expect(calls).toBe(1);

    const second = await provider.createSession({
      identity: 'abc123',
      onFirstCreate,
    });
    sessionsToStop.push(second);
    expect(calls).toBe(1);
  });

  // A marker file alone is not enough. Two concurrent sessions both see it
  // missing and both run the hook, which for a bridge-backed adapter means two
  // `pnpm install` processes writing the same `node_modules`.
  it('runs once even when two sessions race with the same identity', async () => {
    const { projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });

    let concurrent = 0;
    let peakConcurrent = 0;
    let calls = 0;
    const onFirstCreate = async () => {
      calls++;
      concurrent++;
      peakConcurrent = Math.max(peakConcurrent, concurrent);
      await new Promise(done => setTimeout(done, 50));
      concurrent--;
    };

    const sessions = await Promise.all([
      provider.createSession({ identity: 'raced', onFirstCreate }),
      provider.createSession({ identity: 'raced', onFirstCreate }),
      provider.createSession({ identity: 'raced', onFirstCreate }),
    ]);
    sessionsToStop.push(...sessions);

    expect(peakConcurrent).toBe(1);
    expect(calls).toBe(1);
  });

  // A failed bootstrap must not be remembered as done.
  it('does not record the marker when the hook throws, and retries next time', async () => {
    const { root, projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });

    let calls = 0;
    const failing = async () => {
      calls++;
      throw new Error('bootstrap blew up');
    };

    await expect(
      provider.createSession({ identity: 'flaky', onFirstCreate: failing }),
    ).rejects.toThrow(/bootstrap blew up/);
    expect(existsSync(join(root, '.harness-local/first-create-flaky'))).toBe(
      false,
    );

    const succeeding = async () => {
      calls++;
    };
    sessionsToStop.push(
      await provider.createSession({
        identity: 'flaky',
        onFirstCreate: succeeding,
      }),
    );
    expect(calls).toBe(2);
    expect(existsSync(join(root, '.harness-local/first-create-flaky'))).toBe(
      true,
    );
  });

  it('runs again for a different identity', async () => {
    const { projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });

    let calls = 0;
    const onFirstCreate = async () => {
      calls++;
    };

    sessionsToStop.push(
      await provider.createSession({ identity: 'one', onFirstCreate }),
    );
    sessionsToStop.push(
      await provider.createSession({ identity: 'two', onFirstCreate }),
    );
    expect(calls).toBe(2);
  });

  // No identity means no cache key, so skipping would be wrong.
  it('runs every time when no identity is supplied', async () => {
    const { projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });

    let calls = 0;
    const onFirstCreate = async () => {
      calls++;
    };

    sessionsToStop.push(await provider.createSession({ onFirstCreate }));
    sessionsToStop.push(await provider.createSession({ onFirstCreate }));
    expect(calls).toBe(2);
  });

  it('receives the restricted surface', async () => {
    const { projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });

    let received: Record<string, unknown> | undefined;
    sessionsToStop.push(
      await provider.createSession({
        identity: 'surface',
        onFirstCreate: async session => {
          received = session as unknown as Record<string, unknown>;
        },
      }),
    );

    expect(typeof received?.writeTextFile).toBe('function');
    expect(received?.stop).toBeUndefined();
  });

  it('keeps its marker beside the project, not inside it', async () => {
    const { root, projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });
    sessionsToStop.push(
      await provider.createSession({
        identity: 'marker',
        onFirstCreate: async () => {},
      }),
    );

    expect(existsSync(join(root, '.harness-local/first-create-marker'))).toBe(
      true,
    );
    expect(existsSync(join(projectPath, '.harness-local'))).toBe(false);
  });
});

describe('sessions', () => {
  it('uses the supplied sessionId as the durable id', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession(
      { path: projectPath },
      { sessionId: 's-1' },
    );
    expect(session.id).toBe('s-1');
  });

  it('mints an id when none is supplied', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    expect(session.id).toMatch(/^local-workspace-/);
  });

  it('rebinds to the same root on resumeSession', async () => {
    const { projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });

    const first = await provider.createSession({ sessionId: 's-2' });
    sessionsToStop.push(first);
    await first.writeTextFile({
      path: 'myapp/state.txt',
      content: 'persisted',
    });
    await first.stop();

    const resumed = await provider.resumeSession?.({ sessionId: 's-2' });
    expect(resumed).toBeDefined();
    sessionsToStop.push(resumed!);

    expect(resumed!.id).toBe('s-2');
    expect(resumed!.defaultWorkingDirectory).toBe(
      first.defaultWorkingDirectory,
    );
    expect(await resumed!.readTextFile({ path: 'myapp/state.txt' })).toBe(
      'persisted',
    );
  });

  it('gives concurrent sessions distinct ports and independent child sets', async () => {
    const { projectPath } = await createTempProject();
    const provider = createLocalWorkspaceSandbox({ path: projectPath });

    const first = await provider.createSession();
    const second = await provider.createSession();
    sessionsToStop.push(first, second);

    expect(first.ports[0]).not.toBe(second.ports[0]);

    const child = await second.spawn({ command: 'sleep 30' });
    await first.stop();
    // Stopping one session must not reap another session's processes.
    expect(isProcessAlive(child.pid!)).toBe(true);
  });

  // `description` is meant to be pasted into the model's instructions, so a
  // wrong claim about relative paths sends the model's files into the sibling
  // directory. Pin the text against what the session actually does.
  it('describes where relative paths actually resolve', async () => {
    const { root, projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    expect(session.description).toContain(root);
    expect(session.description).toContain(projectPath);

    // The claim: relative paths resolve against the workspace root, so a path
    // inside the project is prefixed with the project directory name.
    expect(session.description).toContain(`${basename(projectPath)}/`);

    // The behaviour, verified rather than assumed.
    await session.writeTextFile({ path: 'at-root.txt', content: 'root' });
    expect(existsSync(join(root, 'at-root.txt'))).toBe(true);
    expect(existsSync(join(projectPath, 'at-root.txt'))).toBe(false);

    await session.writeTextFile({
      path: `${basename(projectPath)}/in-project.txt`,
      content: 'project',
    });
    expect(existsSync(join(projectPath, 'in-project.txt'))).toBe(true);

    const { stdout } = await session.run({ command: 'pwd -P' });
    expect(stdout.trim()).toBe(root);
  });
});

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
