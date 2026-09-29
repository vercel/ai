import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { shellQuote } from '@ai-sdk/harness/utils';
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
  realpathBytes?: (path: string) => Uint8Array | undefined;
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
          mockRealpathCommand(
            command,
            behaviors.realpath,
            behaviors.realpathBytes,
          ) ??
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
  resolveBytes: ((path: string) => Uint8Array | undefined) | undefined,
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
  const frame = command.match(/realpath_marker='([^']+)'/)?.[1];
  const resolvedBytes =
    resolveBytes?.(target) ?? Buffer.from(resolvedPath, 'utf8');
  const outputPath = command.includes('base64')
    ? Buffer.from(resolvedBytes).toString('base64')
    : new TextDecoder().decode(resolvedBytes);
  return {
    stdout: frame == null ? `${resolvedPath}\n` : `${outputPath}${frame}`,
  };
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

describe('createPiRemoteOps with just-bash', () => {
  it('supports file operations with the seeded realpath command', async () => {
    const session = await createJustBashSandbox({
      cwd: sandboxWorkDir,
    }).createSession();
    const sandbox = session.restricted();

    try {
      const realpath = await sandbox.run({ command: 'realpath /tmp' });
      expect(realpath.exitCode).toBe(0);
      expect(realpath.stdout).toBe('/tmp\n');
      await sandbox.writeTextFile({
        path: `${sandboxWorkDir}/notes.md`,
        content: 'alpha\n',
      });

      const ops = createPiRemoteOps({
        sandbox,
        paths: createPiPathMapper({ hostWorkDir, sandboxWorkDir }),
      });

      expect((await ops.readBuffer('notes.md')).toString('utf8')).toBe(
        'alpha\n',
      );
      await ops.writeFile('created.md', 'created\n');
      await expect(ops.editFile('notes.md', 'alpha', 'beta')).resolves.toBe(
        'beta\n',
      );
      await expect(ops.findFiles('*.md', '.')).resolves.toEqual([
        'created.md',
        'notes.md',
      ]);
    } finally {
      await session.destroy();
    }
  });

  it('resolves chained workspace symlinks for file operations', async () => {
    const session = await createJustBashSandbox({
      cwd: sandboxWorkDir,
    }).createSession();
    const sandbox = session.restricted();

    try {
      const setup = await sandbox.run({
        command: [
          `mkdir -p ${sandboxWorkDir}/target/docs`,
          `printf 'read content\\n' > ${sandboxWorkDir}/target/docs/read.txt`,
          `printf 'old content\\n' > ${sandboxWorkDir}/target/docs/edit.txt`,
          `printf 'search needle\\n' > ${sandboxWorkDir}/target/docs/search.txt`,
          `ln -s target ${sandboxWorkDir}/intermediate`,
          `ln -s intermediate/docs ${sandboxWorkDir}/linked-docs`,
        ].join(' && '),
      });
      expect(setup.exitCode).toBe(0);

      // just-bash grep does not support every flag used by grepFiles. Run the
      // path probe in just-bash, then capture only the final grep command so
      // the test can assert that it receives the canonical target path.
      const grepCommands: string[] = [];
      const sandboxWithGrep = new Proxy(sandbox, {
        get(target, property) {
          if (property === 'run') {
            return async (input: { command: string }) => {
              if (input.command.includes('grep ')) {
                grepCommands.push(input.command);
                return {
                  exitCode: 0,
                  stdout: 'target/docs/search.txt:1:search needle\n',
                  stderr: '',
                };
              }
              return target.run(input);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const ops = createPiRemoteOps({
        sandbox: sandboxWithGrep,
        paths: createPiPathMapper({ hostWorkDir, sandboxWorkDir }),
      });

      expect(
        (await ops.readBuffer('linked-docs/read.txt')).toString('utf8'),
      ).toBe('read content\n');

      await ops.writeFile('linked-docs/written.txt', 'written content\n');
      await expect(
        sandbox.readTextFile({
          path: `${sandboxWorkDir}/target/docs/written.txt`,
        }),
      ).resolves.toBe('written content\n');

      await expect(
        ops.editFile('linked-docs/edit.txt', 'old', 'updated'),
      ).resolves.toBe('updated content\n');
      await expect(
        sandbox.readTextFile({
          path: `${sandboxWorkDir}/target/docs/edit.txt`,
        }),
      ).resolves.toBe('updated content\n');

      await expect(ops.listDirectory('linked-docs')).resolves.toEqual([
        'edit.txt',
        'read.txt',
        'search.txt',
        'written.txt',
      ]);
      await expect(ops.findFiles('*.txt', 'linked-docs')).resolves.toEqual([
        'edit.txt',
        'read.txt',
        'search.txt',
        'written.txt',
      ]);
      await expect(
        ops.grepFiles('needle', {
          path: 'linked-docs',
          literal: true,
        }),
      ).resolves.toContain('search.txt:1:search needle');
      expect(grepCommands).toHaveLength(1);
      expect(grepCommands[0]).toContain('target/docs');
      expect(grepCommands[0]).not.toContain('linked-docs');
    } finally {
      await session.destroy();
    }
  });

  it('preserves trailing whitespace in canonical paths', async () => {
    const { sandboxSession, sandbox, ops } = await makeJustBashOps();
    const outsideReadPath = '/sandbox/outside/read-secret.txt';
    const outsideWritePath = '/sandbox/outside/write-target.txt';
    const insideReadPath = `${sandboxWorkDir}/read-target `;
    const insideWritePath = `${sandboxWorkDir}/write-target `;

    try {
      await sandbox.writeTextFile({
        path: outsideReadPath,
        content: 'outside read\n',
      });
      await sandbox.writeTextFile({
        path: outsideWritePath,
        content: 'outside write\n',
      });
      await sandbox.writeTextFile({
        path: insideReadPath,
        content: 'inside read\n',
      });
      await sandbox.writeTextFile({
        path: insideWritePath,
        content: 'inside write\n',
      });

      const setup = await sandbox.run({
        command: [
          `ln -s ${shellQuote(outsideReadPath)} ${shellQuote(`${sandboxWorkDir}/read-target`)}`,
          `ln -s ${shellQuote('read-target ')} ${shellQuote(`${sandboxWorkDir}/read-alias`)}`,
          `ln -s ${shellQuote(outsideWritePath)} ${shellQuote(`${sandboxWorkDir}/write-target`)}`,
          `ln -s ${shellQuote('write-target ')} ${shellQuote(`${sandboxWorkDir}/write-alias`)}`,
        ].join(' && '),
      });
      expect(setup.exitCode).toBe(0);

      await expect(ops.readBuffer('read-alias')).resolves.toEqual(
        Buffer.from('inside read\n'),
      );
      await ops.writeFile('write-alias', 'updated inside\n');
      await expect(
        sandbox.readTextFile({ path: insideWritePath }),
      ).resolves.toBe('updated inside\n');
      await expect(
        sandbox.readTextFile({ path: outsideWritePath }),
      ).resolves.toBe('outside write\n');
    } finally {
      await sandboxSession.destroy();
    }
  });

  it('preserves newlines in canonical paths', async () => {
    const { sandboxSession, sandbox, ops } = await makeJustBashOps();
    const insideReadPath = `${sandboxWorkDir}/read\nname`;
    const insideWritePath = `${sandboxWorkDir}/write\nname`;

    try {
      await sandbox.writeTextFile({
        path: insideReadPath,
        content: 'newline read\n',
      });
      await sandbox.writeTextFile({
        path: insideWritePath,
        content: 'newline write\n',
      });

      const setup = await sandbox.run({
        command: [
          `ln -s ${shellQuote('read\nname')} ${shellQuote(`${sandboxWorkDir}/newline-read-alias`)}`,
          `ln -s ${shellQuote('write\nname')} ${shellQuote(`${sandboxWorkDir}/newline-write-alias`)}`,
        ].join(' && '),
      });
      expect(setup.exitCode).toBe(0);

      await expect(ops.readBuffer('newline-read-alias')).resolves.toEqual(
        Buffer.from('newline read\n'),
      );
      await ops.writeFile('newline-write-alias', 'updated newline\n');
      await expect(
        sandbox.readTextFile({ path: insideWritePath }),
      ).resolves.toBe('updated newline\n');
    } finally {
      await sandboxSession.destroy();
    }
  });

  it('preserves trailing newlines in canonical paths', async () => {
    const { sandboxSession, sandbox, ops } = await makeJustBashOps();
    const outsideReadPath = '/sandbox/outside/trailing-read.txt';
    const outsideWritePath = '/sandbox/outside/trailing-write.txt';
    const insideReadPath = `${sandboxWorkDir}/trailing-read\n`;
    const insideWritePath = `${sandboxWorkDir}/trailing-write\n`;

    try {
      await sandbox.writeTextFile({
        path: outsideReadPath,
        content: 'outside trailing read\n',
      });
      await sandbox.writeTextFile({
        path: outsideWritePath,
        content: 'outside trailing write\n',
      });
      await sandbox.writeTextFile({
        path: insideReadPath,
        content: 'inside trailing read\n',
      });
      await sandbox.writeTextFile({
        path: insideWritePath,
        content: 'inside trailing write\n',
      });

      const setup = await sandbox.run({
        command: [
          `ln -s ${shellQuote(outsideReadPath)} ${shellQuote(`${sandboxWorkDir}/trailing-read`)}`,
          `ln -s ${shellQuote('trailing-read\n')} ${shellQuote(`${sandboxWorkDir}/trailing-read-alias`)}`,
          `ln -s ${shellQuote(outsideWritePath)} ${shellQuote(`${sandboxWorkDir}/trailing-write`)}`,
          `ln -s ${shellQuote('trailing-write\n')} ${shellQuote(`${sandboxWorkDir}/trailing-write-alias`)}`,
        ].join(' && '),
      });
      expect(setup.exitCode).toBe(0);

      await expect(ops.readBuffer('trailing-read-alias')).resolves.toEqual(
        Buffer.from('inside trailing read\n'),
      );
      await ops.writeFile('trailing-write-alias', 'updated trailing\n');
      await expect(
        sandbox.readTextFile({ path: insideWritePath }),
      ).resolves.toBe('updated trailing\n');
      await expect(
        sandbox.readTextFile({ path: outsideWritePath }),
      ).resolves.toBe('outside trailing write\n');
    } finally {
      await sandboxSession.destroy();
    }
  });

  it('rejects intermediate workspace symlinks outside readable roots', async () => {
    const session = await createJustBashSandbox({
      cwd: sandboxWorkDir,
    }).createSession();
    const sandbox = session.restricted();

    try {
      const outsideDir = '/sandbox/outside';
      const setup = await sandbox.run({
        command: [
          `mkdir -p ${outsideDir}`,
          `printf 'outside secret\\n' > ${outsideDir}/secret.txt`,
          `printf 'old outside\\n' > ${outsideDir}/edit.txt`,
          `ln -s ../outside ${sandboxWorkDir}/outside-link`,
        ].join(' && '),
      });
      expect(setup.exitCode).toBe(0);

      const ops = createPiRemoteOps({
        sandbox,
        paths: createPiPathMapper({ hostWorkDir, sandboxWorkDir }),
      });

      await expect(ops.readBuffer('outside-link/secret.txt')).rejects.toThrow(
        /escapes the readable roots/,
      );
      await expect(
        ops.writeFile('outside-link/written.txt', 'should not be written\n'),
      ).rejects.toThrow(/escapes the workspace/);
      await expect(
        ops.editFile('outside-link/edit.txt', 'old', 'updated'),
      ).rejects.toThrow(/escapes the readable roots/);
      await expect(ops.findFiles('*.txt', 'outside-link')).rejects.toThrow(
        /escapes the readable roots/,
      );
      await expect(
        ops.grepFiles('secret', {
          path: 'outside-link',
          literal: true,
        }),
      ).rejects.toThrow(/escapes the readable roots/);

      await expect(
        sandbox.readTextFile({ path: `${outsideDir}/edit.txt` }),
      ).resolves.toBe('old outside\n');
      await expect(
        sandbox.readTextFile({ path: `${outsideDir}/written.txt` }),
      ).resolves.toBeNull();
    } finally {
      await session.destroy();
    }
  });
});

async function makeJustBashOps() {
  const sandboxSession = await createJustBashSandbox({
    cwd: sandboxWorkDir,
  }).createSession();
  const sandbox = sandboxSession.restricted();
  const ops = createPiRemoteOps({
    sandbox,
    paths: createPiPathMapper({ hostWorkDir, sandboxWorkDir }),
  });

  return { sandboxSession, sandbox, ops };
}

function makeNativeShellOps(workDir: string) {
  const canonicalWorkDir = realpathSync.native(workDir);
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
      hostWorkDir: canonicalWorkDir,
      sandboxWorkDir: canonicalWorkDir,
    }),
  });
}

function createNativeFileSandbox(options: {
  readonly readCalls: string[];
  readonly writeCalls: WriteCalls;
}): Experimental_SandboxSession {
  const decodeOutput = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value instanceof Uint8Array) return new TextDecoder().decode(value);
    return '';
  };

  return {
    description: 'native shell with lossy log decoding',
    run: vi.fn(
      async ({
        command,
        workingDirectory,
        env,
      }: {
        command: string;
        workingDirectory?: string;
        env?: Record<string, string>;
      }) => {
        try {
          const result = await execFileAsync('bash', ['-c', command], {
            cwd: workingDirectory,
            env: { ...process.env, ...env },
            encoding: 'buffer',
          });
          return {
            exitCode: 0,
            stdout: decodeOutput(result.stdout),
            stderr: decodeOutput(result.stderr),
          };
        } catch (error) {
          const result = error as {
            code?: number;
            stdout?: Uint8Array | string;
            stderr?: Uint8Array | string;
          };
          return {
            exitCode: typeof result.code === 'number' ? result.code : 1,
            stdout: decodeOutput(result.stdout),
            stderr: decodeOutput(result.stderr),
          };
        }
      },
    ),
    readBinaryFile: vi.fn(async ({ path: inputPath }: { path: string }) => {
      options.readCalls.push(inputPath);
      try {
        return await readFile(inputPath);
      } catch (error) {
        if ((error as { code?: unknown }).code === 'ENOENT') return null;
        throw error;
      }
    }),
    readFile: vi.fn(),
    readTextFile: vi.fn(),
    writeFile: vi.fn(),
    writeBinaryFile: vi.fn(),
    writeTextFile: vi.fn(
      async ({
        path: inputPath,
        content,
      }: {
        path: string;
        content: string;
      }) => {
        options.writeCalls.push({ path: inputPath, content });
        await writeFile(inputPath, content);
      },
    ),
    spawn: vi.fn(),
  } as unknown as Experimental_SandboxSession;
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

  it('rejects canonical paths with invalid UTF-8 before file access', async () => {
    const aliasPath = `${sandboxWorkDir}/raw-alias`;
    const invalidCanonicalPath = Buffer.from(
      `${sandboxWorkDir}/raw-\xff`,
      'latin1',
    );
    const replacementCanonicalPath = `${sandboxWorkDir}/raw-�`;
    const env = makeOps({
      realpathBytes: path =>
        path === aliasPath ? invalidCanonicalPath : undefined,
      readBinary: path =>
        path === replacementCanonicalPath
          ? new TextEncoder().encode('outside secret')
          : null,
    });

    await expect(env.ops.readBuffer('raw-alias')).rejects.toThrow(
      /Unable to resolve path/,
    );
    await expect(
      env.ops.writeFile('raw-alias', 'should not be written'),
    ).rejects.toThrow(/Unable to resolve path/);
    expect(env.readCalls).toEqual([]);
    expect(env.writeCalls).toEqual([]);
  });

  it('rejects invalid UTF-8 paths from native shell output', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'pi-invalid-path-'));
    const workspace = path.join(workDir, 'workspace');
    const outside = path.join(workDir, 'outside');
    const aliasPath = path.join(workspace, 'raw-alias');
    const replacementPath = path.join(workspace, 'raw-�');
    const outsideSecretPath = path.join(outside, 'secret.txt');
    const readCalls: string[] = [];
    const writeCalls: WriteCalls = [];

    try {
      await mkdir(workspace);
      await mkdir(outside);
      await writeFile(outsideSecretPath, 'outside\n');

      const sandbox = createNativeFileSandbox({
        readCalls,
        writeCalls,
      });
      const setup = await sandbox.run({
        command: [
          `raw_path=${shellQuote(`${workspace}/raw-`)}$(printf '\\377')`,
          `printf 'inside\\n' > "$raw_path"`,
          `ln -s ${shellQuote(outsideSecretPath)} ${shellQuote(replacementPath)}`,
          `ln -s "$raw_path" ${shellQuote(aliasPath)}`,
        ].join('; '),
      });
      expect(setup.exitCode).toBe(0);

      const ops = createPiRemoteOps({
        sandbox,
        paths: createPiPathMapper({
          hostWorkDir: workspace,
          sandboxWorkDir: workspace,
        }),
      });

      await expect(ops.readBuffer('raw-alias')).rejects.toThrow(
        /Unable to resolve path/,
      );
      await expect(
        ops.writeFile('raw-alias', 'should not be written'),
      ).rejects.toThrow(/Unable to resolve path/);
      expect(readCalls).toEqual([]);
      expect(writeCalls).toEqual([]);
      await expect(readFile(outsideSecretPath, 'utf8')).resolves.toBe(
        'outside\n',
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
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
    expect(cmd).not.toContain('grep_output=$(grep');
    expect(cmd).toContain('find ');
    expect(cmd).toContain('-exec bash -c');
    expect(cmd).toContain('grep_remaining');
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

  it('limits matches spread across many files in just-bash', async () => {
    const { sandboxSession, sandbox, ops } = await makeJustBashOps();

    try {
      await Promise.all(
        Array.from({ length: 250 }, (_, index) =>
          sandbox.writeTextFile({
            path: `${sandboxWorkDir}/match-${String(index).padStart(3, '0')}.ts`,
            content: `match ${index}\n`,
          }),
        ),
      );

      const output = await ops.grepFiles('match', {
        glob: '*.ts',
        literal: true,
        limit: 3,
      });

      expect(output.split('\n')).toHaveLength(3);
      expect(output).toContain('match-000.ts:1:match 0');
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
