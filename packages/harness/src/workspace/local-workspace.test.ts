import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { mkdtemp, readFile, realpath } from 'node:fs/promises';
import type * as NodeFsModule from 'node:fs';
import { createRequire } from 'node:module';
import type * as NodeModuleModule from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { basename, join, parse } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localWorkspace } from './local-workspace';
import { localWorkspaceStateDirectory } from './local-workspace-state';

const sessionsToStop: Array<{ stop: () => PromiseLike<void> }> = [];
let stateRoot: string;
let previousStateRootOverride: string | undefined;

beforeEach(async () => {
  // Keep every test's state out of the developer's real ~/.ai-sdk.
  stateRoot = await mkdtemp(join(await realpath(tmpdir()), 'lws-state-'));
  previousStateRootOverride = process.env.AI_SDK_HARNESS_STATE_DIR;
  process.env.AI_SDK_HARNESS_STATE_DIR = stateRoot;
});

afterEach(async () => {
  while (sessionsToStop.length > 0) {
    await sessionsToStop.pop()?.stop();
  }
  if (previousStateRootOverride == null) {
    delete process.env.AI_SDK_HARNESS_STATE_DIR;
  } else {
    process.env.AI_SDK_HARNESS_STATE_DIR = previousStateRootOverride;
  }
});

async function createTempProject(name = 'myapp') {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'lws-'));
  const projectPath = join(root, name);
  mkdirSync(projectPath, { recursive: true });
  return { root, projectPath };
}

function makeProvider(settings?: Parameters<typeof localWorkspace>[0]) {
  return localWorkspace(settings).provider;
}

async function startSession(
  settings?: Parameters<typeof localWorkspace>[0],
  options?: { sessionId?: string },
) {
  const session = await makeProvider(settings).createSession(options);
  sessionsToStop.push(session);
  return session;
}

describe('localWorkspace', () => {
  it('returns a workspace wrapping a provider with the conventional id', () => {
    const workspace = localWorkspace({ path: '/tmp/does-not-yet' });
    expect(workspace.type).toBe('local-workspace');
    expect(workspace.provider.providerId).toBe('local-workspace');
    expect(workspace.provider.specificationVersion).toBe('harness-sandbox-v1');
  });

  it('does no filesystem work until createSession is called', async () => {
    const { root } = await createTempProject();
    const projectPath = join(root, 'not-created-yet');
    localWorkspace({ path: projectPath });
    expect(existsSync(projectPath)).toBe(false);
  });

  it('creates the project directory on createSession', async () => {
    const { root } = await createTempProject();
    const projectPath = join(root, 'fresh');
    const session = await startSession({ path: projectPath });
    expect(existsSync(projectPath)).toBe(true);
    expect(session.defaultWorkingDirectory).toBe(projectPath);
  });

  describe('guards', () => {
    it('refuses the filesystem root at construction', () => {
      expect(() => localWorkspace({ path: parse(process.cwd()).root })).toThrow(
        /must not be the filesystem root/,
      );
    });

    it('refuses the home directory at construction', () => {
      expect(() => localWorkspace({ path: homedir() })).toThrow(
        /must not be the home directory/,
      );
    });

    it('refuses a symlink pointing at the home directory once resolved', async () => {
      const { root } = await createTempProject();
      const link = join(root, 'home-link');
      symlinkSync(homedir(), link);

      // The unresolved path passes the eager check …
      const workspace = localWorkspace({ path: link });
      // … and the resolved one is caught at session creation, naming both.
      await expect(workspace.provider.createSession()).rejects.toThrow(
        /must not be the home directory[\s\S]*resolved from/,
      );
    });
  });
});

describe('working directory rooting', () => {
  it('roots defaultWorkingDirectory at the project itself', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    expect(session.defaultWorkingDirectory).toBe(projectPath);
  });

  it('defaults to the current working directory', async () => {
    const session = await startSession();
    expect(session.defaultWorkingDirectory).toBe(await realpath(process.cwd()));
  });

  // Adapters compare a spawned process's `pwd` against
  // `defaultWorkingDirectory`; on macOS /tmp -> /private/tmp, so a raw
  // `dirname()` would not match.
  it('resolves symlinked roots so a spawned pwd matches defaultWorkingDirectory', async () => {
    const { root, projectPath } = await createTempProject();
    const linkRoot = `${root}-link`;
    symlinkSync(root, linkRoot);

    const session = await startSession({
      path: join(linkRoot, basename(projectPath)),
    });

    expect(session.defaultWorkingDirectory).toBe(projectPath);

    const { stdout, exitCode } = await session.run({ command: 'pwd -P' });
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(session.defaultWorkingDirectory);
  });
});

describe('the central state store', () => {
  it('declares a state directory in the per-project store, never the project', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    expect(session.stateDirectory).toBe(
      localWorkspaceStateDirectory(projectPath),
    );
    expect(session.stateDirectory).toContain(stateRoot);
    expect(session.stateDirectory).not.toContain(projectPath);
    expect(existsSync(session.stateDirectory!)).toBe(true);
  });

  it('keys the store by basename and path hash, mappable back via manifest.json', async () => {
    const { projectPath } = await createTempProject('My App.2024');
    const session = await startSession({ path: projectPath });

    expect(basename(session.stateDirectory!)).toMatch(
      /^my-app-2024-[0-9a-f]{8}$/,
    );

    const manifest = JSON.parse(
      readFileSync(join(session.stateDirectory!, 'manifest.json'), 'utf8'),
    );
    expect(manifest.projectPath).toBe(projectPath);
    expect(typeof manifest.createdAt).toBe('string');
    expect(typeof manifest.lastUsedAt).toBe('string');
  });

  it('preserves createdAt while advancing lastUsedAt across sessions', async () => {
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });

    const first = await provider.createSession();
    sessionsToStop.push(first);
    const manifestPath = join(first.stateDirectory!, 'manifest.json');
    const before = JSON.parse(readFileSync(manifestPath, 'utf8'));

    await new Promise(done => setTimeout(done, 5));
    const second = await provider.createSession();
    sessionsToStop.push(second);
    const after = JSON.parse(readFileSync(manifestPath, 'utf8'));

    expect(after.createdAt).toBe(before.createdAt);
    expect(after.lastUsedAt >= before.lastUsedAt).toBe(true);
  });

  it('gives unrelated projects with the same basename distinct stores', async () => {
    const alpha = await createTempProject('same-name');
    const beta = await createTempProject('same-name');

    const first = await startSession({ path: alpha.projectPath });
    const second = await startSession({ path: beta.projectPath });

    expect(first.stateDirectory).not.toBe(second.stateDirectory);
  });

  it('declares the environment as user-owned', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    expect(session.environmentOwner).toBe('user');
  });
});

describe('file operations', () => {
  it('round-trips text and resolves relative paths against the project', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    await session.writeTextFile({ path: 'hello.txt', content: 'hi' });

    expect(await readFile(join(projectPath, 'hello.txt'), 'utf8')).toBe('hi');
    expect(await session.readTextFile({ path: 'hello.txt' })).toBe('hi');
    expect(
      await session.readTextFile({ path: join(projectPath, 'hello.txt') }),
    ).toBe('hi');
  });

  it('creates parent directories on write', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    await session.writeTextFile({ path: 'a/b/c.txt', content: 'deep' });
    expect(await readFile(join(projectPath, 'a/b/c.txt'), 'utf8')).toBe('deep');
  });

  it('resolves to null for a missing file, on every read variant', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    expect(await session.readTextFile({ path: 'nope.txt' })).toBeNull();
    expect(await session.readBinaryFile({ path: 'nope.txt' })).toBeNull();
    expect(await session.readFile({ path: 'nope.txt' })).toBeNull();
  });

  // readFile is the streaming primitive, so obtaining the stream must not pull
  // the file into memory. Deciding null-vs-stream by reading the bytes first
  // buffered the whole file, twice, before the consumer saw a chunk.
  it('does not buffer the file when handing back a stream', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    const megabytes = 32;
    await session.writeBinaryFile({
      path: 'big.bin',
      content: new Uint8Array(megabytes * 1024 * 1024),
    });

    const before = process.memoryUsage().arrayBuffers;
    const stream = await session.readFile({ path: 'big.bin' });
    const grewByMb =
      (process.memoryUsage().arrayBuffers - before) / 1024 / 1024;

    expect(stream).not.toBeNull();
    expect(grewByMb).toBeLessThan(megabytes / 2);

    await stream?.cancel();
  });

  it('applies 1-based inclusive line ranges', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    await session.writeTextFile({
      path: 'lines.txt',
      content: 'one\ntwo\nthree\nfour',
    });

    expect(
      await session.readTextFile({
        path: 'lines.txt',
        startLine: 2,
        endLine: 3,
      }),
    ).toBe('two\nthree');
    // endLine past EOF reads through EOF without error.
    expect(
      await session.readTextFile({
        path: 'lines.txt',
        startLine: 3,
        endLine: 99,
      }),
    ).toBe('three\nfour');
  });

  it('round-trips binary content and streams', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    const bytes = new Uint8Array([0, 1, 2, 250]);

    await session.writeBinaryFile({ path: 'bin', content: bytes });
    expect(await session.readBinaryFile({ path: 'bin' })).toEqual(bytes);

    const stream = await session.readFile({ path: 'bin' });
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes));
  });

  // Pi installs a global node:fs patch via syncBuiltinESMExports. Because the
  // session destructures its bindings at module load, writes must still hit
  // the real disk after the namespace is mutated.
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
        path: 'REL.md',
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

  it('runs in a workingDirectory relative to the project', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });
    await session.writeTextFile({ path: 'nested/keep.txt', content: 'x' });
    const { stdout } = await session.run({
      command: 'pwd -P',
      workingDirectory: 'nested',
    });
    expect(stdout.trim()).toBe(join(projectPath, 'nested'));
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

  // Bridges spawn CLIs that spawn more processes, so stop() must reap the
  // whole tree, not just the direct child.
  it('kills the entire process tree on stop', async () => {
    const { projectPath } = await createTempProject();
    const session = await makeProvider({ path: projectPath }).createSession();

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

  it('registers a single exit handler no matter how many sessions exist', async () => {
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });

    const before = process.listenerCount('exit');
    const sessions = await Promise.all(
      Array.from({ length: 12 }, () => provider.createSession()),
    );
    sessionsToStop.push(...sessions);

    expect(process.listenerCount('exit')).toBeLessThanOrEqual(before + 1);
  });

  it('is idempotent on stop and destroy', async () => {
    const { projectPath } = await createTempProject();
    const session = await makeProvider({ path: projectPath }).createSession();
    await session.stop();
    await session.stop();
    await session.destroy?.();
  });
});

describe('ports', () => {
  it('allocates one loopback port by default and resolves endpoints for it', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    expect(session.ports).toHaveLength(1);
    const [port] = session.ports;
    expect(port).toBeGreaterThan(0);

    expect(await session.getPortEndpoint({ port, protocol: 'ws' })).toEqual({
      url: `ws://127.0.0.1:${port}`,
    });
    expect(await session.getPortUrl({ port })).toBe(`http://127.0.0.1:${port}`);
  });

  it('resolves a port from a previous session, as reattach does', async () => {
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });

    const first = await provider.createSession();
    sessionsToStop.push(first);
    const detachedPort = first.ports[0];
    await first.stop();

    const resumed = await provider.resumeSession?.({ sessionId: 'resumed' });
    expect(resumed).toBeDefined();
    sessionsToStop.push(resumed!);

    // Fresh pool, but the persisted port still resolves. Rejecting it is what
    // made every reattach respawn and orphan the running bridge.
    expect(resumed!.ports).not.toContain(detachedPort);
    expect(
      (await resumed!.getPortEndpoint({ port: detachedPort, protocol: 'ws' }))
        .url,
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
    expect(
      (restricted as Record<string, unknown>).getPortEndpoint,
    ).toBeUndefined();
    expect(
      (restricted as Record<string, unknown>).setNetworkPolicy,
    ).toBeUndefined();
  });

  it('points at the same underlying resource', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    await session.restricted().writeTextFile({
      path: 'from-restricted.txt',
      content: 'same box',
    });
    expect(await session.readTextFile({ path: 'from-restricted.txt' })).toBe(
      'same box',
    );
  });
});

describe('onFirstCreate', () => {
  it('runs once per identity and records its marker in the state store', async () => {
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });

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
    expect(
      existsSync(join(first.stateDirectory!, '.first-create-abc123.ok')),
    ).toBe(true);
    // Nothing lands in the project.
    expect(existsSync(join(projectPath, '.harness-bootstrap'))).toBe(false);

    const second = await provider.createSession({
      identity: 'abc123',
      onFirstCreate,
    });
    sessionsToStop.push(second);
    expect(calls).toBe(1);
  });

  // The framework's recipe hook writes relative paths (.harness-bootstrap/…)
  // against whatever session it receives; rooting it at the project would put
  // infrastructure into the user's files.
  it('receives a session rooted at the state directory, not the project', async () => {
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });

    let observedPwd: string | undefined;
    const session = await provider.createSession({
      identity: 'rooted',
      onFirstCreate: async setup => {
        await setup.writeTextFile({
          path: '.harness-bootstrap/probe.txt',
          content: 'infra',
        });
        observedPwd = (await setup.run({ command: 'pwd -P' })).stdout.trim();
      },
    });
    sessionsToStop.push(session);

    const stateDirectory = localWorkspaceStateDirectory(projectPath);
    expect(observedPwd).toBe(await realpath(stateDirectory));
    expect(
      existsSync(join(stateDirectory, '.harness-bootstrap/probe.txt')),
    ).toBe(true);
    expect(existsSync(join(projectPath, '.harness-bootstrap'))).toBe(false);
  });

  it('runs once even when two sessions race with the same identity', async () => {
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });

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
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });
    const markerPath = join(
      localWorkspaceStateDirectory(projectPath),
      '.first-create-flaky.ok',
    );

    let calls = 0;
    await expect(
      provider.createSession({
        identity: 'flaky',
        onFirstCreate: async () => {
          calls++;
          throw new Error('bootstrap blew up');
        },
      }),
    ).rejects.toThrow(/bootstrap blew up/);
    expect(existsSync(markerPath)).toBe(false);

    sessionsToStop.push(
      await provider.createSession({
        identity: 'flaky',
        onFirstCreate: async () => {
          calls++;
        },
      }),
    );
    expect(calls).toBe(2);
    expect(existsSync(markerPath)).toBe(true);
  });

  // No identity means no cache key, so skipping would be wrong.
  it('runs every time when no identity is supplied', async () => {
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });

    let calls = 0;
    const onFirstCreate = async () => {
      calls++;
    };

    sessionsToStop.push(await provider.createSession({ onFirstCreate }));
    sessionsToStop.push(await provider.createSession({ onFirstCreate }));
    expect(calls).toBe(2);
  });

  it('re-runs after the marker is deleted', async () => {
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });

    let calls = 0;
    const onFirstCreate = async () => {
      calls++;
    };

    sessionsToStop.push(
      await provider.createSession({ identity: 'redo', onFirstCreate }),
    );
    expect(calls).toBe(1);

    rmSync(
      join(localWorkspaceStateDirectory(projectPath), '.first-create-redo.ok'),
      { force: true },
    );

    sessionsToStop.push(
      await provider.createSession({ identity: 'redo', onFirstCreate }),
    );
    expect(calls).toBe(2);
  });

  it('serialises across separate workspaces on the same project', async () => {
    const { projectPath } = await createTempProject();
    const first = makeProvider({ path: projectPath });
    const second = makeProvider({ path: projectPath });

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
      first.createSession({ identity: 'cross-provider', onFirstCreate }),
      second.createSession({ identity: 'cross-provider', onFirstCreate }),
    ]);
    sessionsToStop.push(...sessions);

    expect(peakConcurrent).toBe(1);
    expect(calls).toBe(1);
  });

  it('does not block workspaces rooted somewhere else', async () => {
    const alpha = await createTempProject();
    const beta = await createTempProject();

    let calls = 0;
    const onFirstCreate = async () => {
      calls++;
    };

    const sessions = await Promise.all([
      makeProvider({ path: alpha.projectPath }).createSession({
        identity: 'same-id',
        onFirstCreate,
      }),
      makeProvider({ path: beta.projectPath }).createSession({
        identity: 'same-id',
        onFirstCreate,
      }),
    ]);
    sessionsToStop.push(...sessions);

    // Same identity, unrelated projects: both must bootstrap.
    expect(calls).toBe(2);
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

  it('rebinds to the same project on resumeSession', async () => {
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });

    const first = await provider.createSession({ sessionId: 's-2' });
    sessionsToStop.push(first);
    await first.writeTextFile({ path: 'state.txt', content: 'persisted' });
    await first.stop();

    const resumed = await provider.resumeSession?.({ sessionId: 's-2' });
    expect(resumed).toBeDefined();
    sessionsToStop.push(resumed!);

    expect(resumed!.id).toBe('s-2');
    expect(resumed!.defaultWorkingDirectory).toBe(
      first.defaultWorkingDirectory,
    );
    expect(await resumed!.readTextFile({ path: 'state.txt' })).toBe(
      'persisted',
    );
  });

  it('gives concurrent sessions distinct ports and independent child sets', async () => {
    const { projectPath } = await createTempProject();
    const provider = makeProvider({ path: projectPath });

    const first = await provider.createSession();
    const second = await provider.createSession();
    sessionsToStop.push(first, second);

    expect(first.ports[0]).not.toBe(second.ports[0]);

    const child = await second.spawn({ command: 'sleep 30' });
    await first.stop();
    // Stopping one session must not reap another session's processes.
    expect(isProcessAlive(child.pid!)).toBe(true);
  });

  // Pin the text against what the session actually does: a wrong claim here
  // sends the model's files into a sibling directory.
  it('describes where relative paths actually resolve', async () => {
    const { projectPath } = await createTempProject();
    const session = await startSession({ path: projectPath });

    expect(session.description).toContain(projectPath);

    // The behaviour, verified rather than assumed.
    await session.writeTextFile({ path: 'in-project.txt', content: 'project' });
    expect(existsSync(join(projectPath, 'in-project.txt'))).toBe(true);

    const { stdout } = await session.run({ command: 'pwd -P' });
    expect(stdout.trim()).toBe(projectPath);
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
