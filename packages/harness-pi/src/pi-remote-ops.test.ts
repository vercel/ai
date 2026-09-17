import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, it, vi } from 'vitest';
import { createPiPathMapper } from './pi-paths';
import { createPiRemoteOps } from './pi-remote-ops';

type RunCalls = Array<{
  command: string;
  workingDirectory?: string;
}>;
type ReadCalls = string[];
type WriteCalls = Array<{ path: string; content: string }>;

const execFileAsync = promisify(execFile);

function makeMockSandbox(behaviors: {
  run?: (command: string) => {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  realpath?: (path: string) => string | null;
  readBinary?: (path: string) => Uint8Array | null;
}): {
  sandbox: Experimental_SandboxSession;
  runCalls: RunCalls;
  readCalls: ReadCalls;
  writeCalls: WriteCalls;
} {
  const runCalls: RunCalls = [];
  const readCalls: ReadCalls = [];
  const writeCalls: WriteCalls = [];

  const sandbox: Experimental_SandboxSession = {
    description: 'mock',
    run: vi.fn(
      async ({
        command,
        workingDirectory,
      }: {
        command: string;
        workingDirectory?: string;
      }) => {
        runCalls.push({ command, workingDirectory });
        const result =
          mockRealpathCommand(command, behaviors.realpath) ??
          behaviors.run?.(command) ??
          {};
        return {
          exitCode: result.exitCode ?? 0,
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
        };
      },
    ),
    readBinaryFile: vi.fn(async ({ path }: { path: string }) => {
      readCalls.push(path);
      return behaviors.readBinary?.(path) ?? null;
    }),
    readFile: vi.fn(),
    readTextFile: vi.fn(),
    writeFile: vi.fn(),
    writeBinaryFile: vi.fn(),
    writeTextFile: vi.fn(
      async ({ path, content }: { path: string; content: string }) => {
        writeCalls.push({ path, content });
      },
    ),
    spawn: vi.fn(),
  } as unknown as Experimental_SandboxSession;

  return { sandbox, runCalls, readCalls, writeCalls };
}

function mockRealpathCommand(
  command: string,
  resolvePath: ((path: string) => string | null) | undefined,
): { stdout?: string; stderr?: string; exitCode?: number } | undefined {
  if (!command.includes('realpath')) {
    return undefined;
  }

  const target = command.match(/target='([^']+)'/)?.[1];
  if (!target) {
    return undefined;
  }

  const resolvedPath = resolvePath?.(target) ?? target;
  if (resolvedPath === null) {
    return { stdout: '__PI_REALPATH_NOT_FOUND__\n', exitCode: 2 };
  }
  return { stdout: `${resolvedPath}\n` };
}

const hostWorkDir = '/tmp/pi-test-host';
const sandboxWorkDir = '/sandbox/workspace';

function makeOps(behaviors: Parameters<typeof makeMockSandbox>[0]) {
  const env = makeMockSandbox(behaviors);
  const paths = createPiPathMapper({
    hostWorkDir,
    sandboxWorkDir,
    readableRoots: [{ sandboxDir: '/home/vercel-sandbox/.agents/skills' }],
  });
  const ops = createPiRemoteOps({ sandbox: env.sandbox, paths });
  return { ...env, paths, ops };
}

async function makeJustBashOps() {
  const sandboxSession = await createJustBashSandbox({
    cwd: sandboxWorkDir,
  }).createSession();
  const justBashSandbox = sandboxSession.restricted();
  const sandbox = new Proxy(justBashSandbox, {
    get(target, property) {
      if (property === 'run') {
        return async (
          input: Parameters<Experimental_SandboxSession['run']>[0],
        ) => {
          const realpathResult = mockRealpathCommand(
            input.command,
            path => path,
          );
          return realpathResult == null
            ? target.run(input)
            : {
                exitCode: realpathResult.exitCode ?? 0,
                stdout: realpathResult.stdout ?? '',
                stderr: realpathResult.stderr ?? '',
              };
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const ops = createPiRemoteOps({
    sandbox,
    paths: createPiPathMapper({ hostWorkDir, sandboxWorkDir }),
  });

  return { sandboxSession, sandbox, ops };
}

function makeNativeShellOps(workDir: string) {
  const sandbox = {
    description: 'native shell',
    async run({
      command,
      workingDirectory,
      env,
    }: {
      command: string;
      workingDirectory?: string;
      env?: Record<string, string>;
    }) {
      try {
        const result = await execFileAsync('bash', ['-c', command], {
          cwd: workingDirectory,
          env: { ...process.env, ...env },
          encoding: 'utf8',
        });
        return { exitCode: 0, ...result };
      } catch (error) {
        const result = error as {
          code?: number;
          stdout?: string;
          stderr?: string;
        };
        return {
          exitCode: typeof result.code === 'number' ? result.code : 1,
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
        };
      }
    },
  } as unknown as Experimental_SandboxSession;

  return createPiRemoteOps({
    sandbox,
    paths: createPiPathMapper({
      hostWorkDir: workDir,
      sandboxWorkDir: workDir,
    }),
  });
}

describe('createPiRemoteOps.readBuffer', () => {
  it('reads via readBinaryFile and returns a Buffer', async () => {
    const env = makeOps({
      readBinary: p =>
        p === `${sandboxWorkDir}/hello.txt`
          ? new TextEncoder().encode('hi')
          : null,
    });
    const buf = await env.ops.readBuffer('hello.txt');
    expect(buf.toString('utf8')).toBe('hi');
  });

  it('throws when file does not exist', async () => {
    const env = makeOps({ readBinary: () => null });
    await expect(env.ops.readBuffer('nope.txt')).rejects.toThrow(
      /Path not found/,
    );
  });

  it('reads configured sandbox skill roots', async () => {
    const skillPath =
      '/home/vercel-sandbox/.agents/skills/weather-codes/SKILL.md';
    const env = makeOps({
      readBinary: p =>
        p === skillPath ? new TextEncoder().encode('skill') : null,
    });
    const buf = await env.ops.readBuffer(skillPath);
    expect(buf.toString('utf8')).toBe('skill');
  });

  it('rejects workspace symlinks that resolve outside readable roots', async () => {
    const outsideSecretPath = '/home/vercel-sandbox/CODEX_API_KEY';
    const env = makeOps({
      realpath: p =>
        p === `${sandboxWorkDir}/repo-controlled-secret-link`
          ? outsideSecretPath
          : p,
      readBinary: p =>
        p === outsideSecretPath
          ? new TextEncoder().encode('CODEX_API_KEY=secret')
          : null,
    });

    await expect(
      env.ops.readBuffer('repo-controlled-secret-link'),
    ).rejects.toThrow(/escapes the readable roots/);
    expect(env.readCalls).toEqual([]);
  });
});

describe('createPiRemoteOps.writeFile', () => {
  it('mkdir -p the parent and writes via writeTextFile', async () => {
    const env = makeOps({ readBinary: () => null });
    await env.ops.writeFile('src/new.ts', 'export {};');
    expect(env.runCalls[1]?.command).toContain('mkdir -p');
    expect(env.runCalls[1]?.command).toContain(`'${sandboxWorkDir}/src'`);
    expect(env.writeCalls).toEqual([
      { path: `${sandboxWorkDir}/src/new.ts`, content: 'export {};' },
    ]);
  });

  it('fires onFileChange with create when previous is empty', async () => {
    const onFileChange = vi.fn();
    const sandboxEnv = makeMockSandbox({ readBinary: () => null });
    const ops = createPiRemoteOps({
      sandbox: sandboxEnv.sandbox,
      paths: createPiPathMapper({ hostWorkDir, sandboxWorkDir }),
      onFileChange,
    });
    await ops.writeFile('a.txt', 'x');
    expect(onFileChange).toHaveBeenCalledWith(
      'create',
      'a.txt',
      expect.anything(),
    );
  });

  it('fires onFileChange with modify when previous exists', async () => {
    const onFileChange = vi.fn();
    const sandboxEnv = makeMockSandbox({
      readBinary: () => new Uint8Array([1, 2, 3]),
    });
    const ops = createPiRemoteOps({
      sandbox: sandboxEnv.sandbox,
      paths: createPiPathMapper({ hostWorkDir, sandboxWorkDir }),
      onFileChange,
    });
    await ops.writeFile('a.txt', 'x');
    expect(onFileChange).toHaveBeenCalledWith(
      'modify',
      'a.txt',
      expect.anything(),
    );
  });

  it('rejects workspace symlinks that resolve outside the workspace', async () => {
    const outsideConfigPath = '/home/vercel-sandbox/victim-config.json';
    const env = makeOps({
      realpath: p =>
        p === `${sandboxWorkDir}/repo-controlled-write-link`
          ? outsideConfigPath
          : p,
      readBinary: p =>
        p === outsideConfigPath ? new TextEncoder().encode('{}') : null,
    });

    await expect(
      env.ops.writeFile('repo-controlled-write-link', '{"owned":true}\n'),
    ).rejects.toThrow(/escapes the workspace/);
    expect(env.writeCalls).toEqual([]);
    expect(env.runCalls.some(call => call.command.includes('mkdir -p'))).toBe(
      false,
    );
  });
});

describe('createPiRemoteOps.editFile', () => {
  it('replaces first occurrence and writes back', async () => {
    let current = 'old text here, and old text again';
    const sandboxEnv = makeMockSandbox({
      readBinary: () => new TextEncoder().encode(current),
    });
    const ops = createPiRemoteOps({
      sandbox: sandboxEnv.sandbox,
      paths: createPiPathMapper({ hostWorkDir, sandboxWorkDir }),
    });
    const result = await ops.editFile('a.txt', 'old text', 'new text');
    expect(result).toBe('new text here, and old text again');
  });

  it('throws if oldText not found', async () => {
    const sandboxEnv = makeMockSandbox({
      readBinary: () => new TextEncoder().encode('hello'),
    });
    const ops = createPiRemoteOps({
      sandbox: sandboxEnv.sandbox,
      paths: createPiPathMapper({ hostWorkDir, sandboxWorkDir }),
    });
    await expect(ops.editFile('a.txt', 'missing', 'x')).rejects.toThrow(
      /not found/,
    );
  });
});

describe('createPiRemoteOps.listDirectory', () => {
  it('uses compatible ls flags and preserves trailing directory markers', async () => {
    const env = makeOps({
      run: () => ({ stdout: 'src/\nREADME.md\nnode_modules/\n' }),
    });
    const names = await env.ops.listDirectory('.');
    expect(names).toEqual(['node_modules/', 'README.md', 'src/']);
    const cmd =
      env.runCalls.find(call => call.command.includes('ls -1AF'))?.command ??
      '';
    expect(cmd).toContain('ls -1AF');
    expect(cmd).not.toContain('ls -1Ap');
  });

  it('throws on __PI_LS_NOT_FOUND__ sentinel', async () => {
    const env = makeOps({
      run: () => ({ stdout: '__PI_LS_NOT_FOUND__\n', exitCode: 2 }),
    });
    await expect(env.ops.listDirectory('nope')).rejects.toThrow(
      /Path not found/,
    );
  });
});

describe('createPiRemoteOps.grepFiles', () => {
  it('builds the grep command with the requested flags', async () => {
    const env = makeOps({
      run: () => ({ stdout: 'foo.ts:1:hit\n' }),
    });
    const out = await env.ops.grepFiles('TODO', {
      ignoreCase: true,
      literal: true,
      context: 2,
      glob: '*.ts',
      limit: 50,
    });
    expect(out).toContain('foo.ts:1:hit');
    const cmd =
      env.runCalls.find(call => call.command.includes('grep '))?.command ?? '';
    expect(cmd).toContain('grep');
    expect(cmd).toContain('-r');
    expect(cmd).not.toContain('-R');
    expect(cmd).toContain('-i');
    expect(cmd).toContain('-F');
    expect(cmd).toContain('-C');
    expect(cmd).toContain("'-m' '50'");
    expect(cmd).toContain("'--include=*.ts'");
    expect(cmd).toContain("-e 'TODO'");
    expect(cmd).toContain(
      'binary_option_error=$(grep --binary-files=without-match',
    );
    expect(cmd).toContain('grep $binary_option');
    expect(cmd).not.toContain('2>/dev/null');
    expect(cmd).toContain('head -n 50');
    expect(cmd).toContain('head -c 8192 "$grep_stderr" >&2');
    expect(cmd).not.toContain('grep_output=');
  });

  it('returns "No matches found" on empty output', async () => {
    const env = makeOps({ run: () => ({ stdout: '', exitCode: 1 }) });
    const out = await env.ops.grepFiles('x', {});
    expect(out).toBe('No matches found');
  });

  it('accepts grep SIGPIPE when head stops after the requested limit', async () => {
    const env = makeOps({
      run: () => ({ stdout: 'foo.ts:1:hit\n', exitCode: 141 }),
    });

    await expect(env.ops.grepFiles('hit', { limit: 1 })).resolves.toBe(
      'foo.ts:1:hit',
    );
  });

  it('prefixes option-like relative targets with ./', async () => {
    const env = makeOps({
      run: () => ({ stdout: './-notes.txt:1:hit\n' }),
    });

    await env.ops.grepFiles('hit', { path: '-notes.txt' });

    const cmd =
      env.runCalls.find(call => call.command.includes('grep $binary_option'))
        ?.command ?? '';
    expect(cmd).toContain("'./-notes.txt'");
  });

  it('surfaces grep errors instead of reporting no matches', async () => {
    const env = makeOps({
      run: () => ({
        stderr: 'grep: invalid option\n',
        exitCode: 0,
      }),
    });
    await expect(env.ops.grepFiles('x', {})).rejects.toThrow(
      'grep: invalid option',
    );
  });

  it('preserves GNU grep matches when recursive traversal also reports diagnostics', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'pi-grep-gnu-'));
    const blockedDirectory = path.join(workDir, 'blocked');

    try {
      await writeFile(path.join(workDir, 'match.txt'), 'needle\n');
      await mkdir(blockedDirectory);
      await writeFile(path.join(blockedDirectory, 'hidden.txt'), 'needle\n');
      await chmod(blockedDirectory, 0);

      const output = await makeNativeShellOps(workDir).grepFiles('needle', {
        literal: true,
      });

      expect(output).toContain('match.txt:1:needle');
      expect(output).toContain('Permission denied');
    } finally {
      await chmod(blockedDirectory, 0o700).catch(() => {});
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('bounds GNU grep diagnostics independently of the match limit', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'pi-grep-gnu-'));
    const blockedDirectories = Array.from({ length: 250 }, (_, index) =>
      path.join(workDir, `blocked-${String(index).padStart(3, '0')}`),
    );

    try {
      await writeFile(path.join(workDir, 'match.txt'), 'needle\n');
      await Promise.all(
        blockedDirectories.map(async directory => {
          await mkdir(directory);
          await chmod(directory, 0);
        }),
      );

      const output = await makeNativeShellOps(workDir).grepFiles('needle', {
        literal: true,
        limit: 1,
      });

      expect(output).toContain('match.txt:1:needle');
      expect(output).toContain('Permission denied');
      expect(Buffer.byteLength(output)).toBeLessThan(8_300);
    } finally {
      await Promise.all(
        blockedDirectories.map(directory =>
          chmod(directory, 0o700).catch(() => {}),
        ),
      );
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('rejects workspace symlinks before running grep outside readable roots', async () => {
    const outsideSecretPath = '/home/vercel-sandbox/CODEX_API_KEY';
    const env = makeOps({
      realpath: p =>
        p === `${sandboxWorkDir}/repo-controlled-secret-link`
          ? outsideSecretPath
          : p,
      run: () => ({ stdout: 'CODEX_API_KEY=secret\n' }),
    });

    await expect(
      env.ops.grepFiles('secret', {
        path: 'repo-controlled-secret-link',
        literal: true,
      }),
    ).rejects.toThrow(/escapes the readable roots/);
    expect(env.runCalls.some(call => call.command.includes('grep '))).toBe(
      false,
    );
  });

  it('returns text matches when a just-bash workspace also contains matching binary data', async () => {
    const { sandboxSession, sandbox, ops } = await makeJustBashOps();

    try {
      await sandbox.writeTextFile({
        path: `${sandboxWorkDir}/text.txt`,
        content: 'hello from text\n',
      });
      await sandbox.writeBinaryFile({
        path: `${sandboxWorkDir}/data.bin`,
        content: new Uint8Array([0, 104, 101, 108, 108, 111, 10]),
      });

      await expect(
        ops.grepFiles('hello', { literal: true }),
      ).resolves.toContain('text.txt:1:hello from text');
    } finally {
      await sandboxSession.destroy();
    }
  });

  it('searches an option-like filename in just-bash', async () => {
    const { sandboxSession, sandbox, ops } = await makeJustBashOps();

    try {
      await sandbox.writeTextFile({
        path: `${sandboxWorkDir}/-notes.txt`,
        content: 'hello\n',
      });

      await expect(
        ops.grepFiles('hello', { path: '-notes.txt', literal: true }),
      ).resolves.toContain('hello');
    } finally {
      await sandboxSession.destroy();
    }
  });

  it('surfaces grep diagnostics from just-bash', async () => {
    const { sandboxSession, sandbox, ops } = await makeJustBashOps();

    try {
      await sandbox.writeTextFile({
        path: `${sandboxWorkDir}/text.txt`,
        content: 'hello\n',
      });

      await expect(ops.grepFiles('[', {})).rejects.toThrow(
        'grep: invalid regular expression',
      );
    } finally {
      await sandboxSession.destroy();
    }
  });

  it('limits high-cardinality grep output in just-bash', async () => {
    const { sandboxSession, sandbox, ops } = await makeJustBashOps();

    try {
      await sandbox.writeTextFile({
        path: `${sandboxWorkDir}/many.txt`,
        content: `${Array.from(
          { length: 5_000 },
          (_, index) => `match ${index}`,
        ).join('\n')}\n`,
      });

      const output = await ops.grepFiles('match', {
        literal: true,
        limit: 3,
      });

      expect(output.split('\n')).toHaveLength(3);
      expect(output).toContain('many.txt:1:match 0');
    } finally {
      await sandboxSession.destroy();
    }
  });
});

describe('createPiRemoteOps.exec', () => {
  it('runs through bash -lc and returns exit code', async () => {
    const env = makeOps({ run: () => ({ stdout: 'hello\n', exitCode: 0 }) });
    const chunks: Buffer[] = [];
    const result = await env.ops.exec('echo hello', '.', {
      onData: data => chunks.push(data),
    });
    expect(result).toEqual({ exitCode: 0 });
    expect(Buffer.concat(chunks).toString('utf8')).toBe('hello\n');
  });

  it('schedules the abort timeout in seconds, not milliseconds', async () => {
    const env = makeOps({ run: () => ({ stdout: '', exitCode: 0 }) });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    try {
      await env.ops.exec('echo hi', '.', {
        onData: () => {},
        // The model passes the timeout in seconds; a 30-second timeout must be
        // scheduled 30_000 ms out, not 30 ms (which would abort instantly).
        timeout: 30,
      });
      const delays = setTimeoutSpy.mock.calls.map(call => call[1]);
      expect(delays).toContain(30_000);
      expect(delays).not.toContain(30);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
