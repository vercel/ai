import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { createPiPathMapper } from './pi-paths';
import { createPiRemoteOps } from './pi-remote-ops';

type RunCalls = Array<{
  command: string;
  workingDirectory?: string;
}>;
type ReadCalls = string[];
type WriteCalls = Array<{ path: string; content: string }>;

function makeMockSandbox(behaviors: {
  run?: (command: string) => {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  canonicalize?: (path: string) => string | null;
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
          mockCanonicalizeCommand(command, behaviors.canonicalize) ??
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

function mockCanonicalizeCommand(
  command: string,
  resolvePath: ((path: string) => string | null) | undefined,
): { stdout?: string; stderr?: string; exitCode?: number } | undefined {
  if (!command.includes('pi_resolve_path')) {
    return undefined;
  }

  if (command.includes('__PI_RESOLVED_TARGET__')) {
    const targets = [...command.matchAll(/target='([^']+)'/g)].map(
      match => match[1],
    );
    const [requestedTarget, ...policyRoots] = targets;
    if (!requestedTarget) {
      return { stdout: '__PI_REALPATH_FAILED__\n', exitCode: 3 };
    }
    const resolvedTarget = resolvePath?.(requestedTarget) ?? requestedTarget;
    if (resolvedTarget === null) {
      return command.includes('__PI_REALPATH_NOT_FOUND__')
        ? { stdout: '__PI_REALPATH_NOT_FOUND__\n', exitCode: 2 }
        : { stdout: '__PI_REALPATH_FAILED__\n', exitCode: 3 };
    }

    const lines = [`__PI_RESOLVED_TARGET__${resolvedTarget}`];
    for (const [index, target] of policyRoots.entries()) {
      const resolvedPath = resolvePath?.(target) ?? target;
      if (resolvedPath === null) {
        return {
          stdout: `__PI_POLICY_ROOT_FAILED__${index}\n`,
          exitCode: 3,
        };
      }
      lines.push(`__PI_POLICY_ROOT_${index}__${resolvedPath}`);
    }
    return { stdout: `${lines.join('\n')}\n` };
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

function makeOps(
  behaviors: Parameters<typeof makeMockSandbox>[0],
  options: {
    fileToolPathPolicy?: {
      readableRoots?: ReadonlyArray<string>;
      writableRoots?: ReadonlyArray<string>;
      deniedRoots?: ReadonlyArray<string>;
    };
    onFileChange?: Parameters<typeof createPiRemoteOps>[0]['onFileChange'];
  } = {},
) {
  const env = makeMockSandbox(behaviors);
  const paths = createPiPathMapper({
    hostWorkDir,
    sandboxWorkDir,
    readableRoots: [{ sandboxDir: '/home/vercel-sandbox/.agents/skills' }],
    ...(options.fileToolPathPolicy
      ? { fileToolPathPolicy: options.fileToolPathPolicy }
      : {}),
  });
  const ops = createPiRemoteOps({
    sandbox: env.sandbox,
    paths,
    ...(options.onFileChange ? { onFileChange: options.onFileChange } : {}),
  });
  return { ...env, paths, ops };
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
    expect(env.runCalls[0]?.command).toContain('cd -P "$dir"');
    expect(env.runCalls[0]?.command).toContain('readlink "$candidate"');
    expect(env.runCalls[0]?.command).not.toContain('realpath');
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
      canonicalize: p =>
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
    const mkdirCommand = env.runCalls.find(call =>
      call.command.includes('mkdir -p'),
    )?.command;
    expect(mkdirCommand).toContain('mkdir -p');
    expect(mkdirCommand).toContain(`'${sandboxWorkDir}/src'`);
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
      canonicalize: p =>
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
  it('uses portable ls output inside the sandbox and preserves trailing / for dirs', async () => {
    const env = makeOps({
      run: () => ({ stdout: 'src/\nREADME.md\nnode_modules/\n' }),
    });
    const names = await env.ops.listDirectory('.');
    expect(names).toEqual(['node_modules/', 'README.md', 'src/']);
    const cmd =
      env.runCalls.find(call => call.command.includes('ls -1A'))?.command ?? '';
    expect(cmd).toContain('ls -1A');
    expect(cmd).not.toContain('ls -1Ap');
    expect(cmd).toContain(`if [ -d "$entry" ]`);
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
      env.runCalls.find(call => call.command.includes('-exec grep'))?.command ??
      '';
    expect(cmd).toContain(`find '${sandboxWorkDir}'`);
    expect(cmd).toContain('-exec grep');
    expect(cmd).not.toContain('grep -R');
    expect(cmd).toContain('-i');
    expect(cmd).toContain('-F');
    expect(cmd).toContain('-C');
    expect(cmd).toContain('-name');
    expect(cmd).toContain('*.ts');
    expect(cmd).toContain('binary_flag');
    expect(cmd).toContain('head -n 50');
  });

  it('returns "No matches found" on empty output', async () => {
    const env = makeOps({ run: () => ({ stdout: '' }) });
    const out = await env.ops.grepFiles('x', {});
    expect(out).toBe('No matches found');
  });

  it('rejects workspace symlinks before running grep outside readable roots', async () => {
    const outsideSecretPath = '/home/vercel-sandbox/CODEX_API_KEY';
    const env = makeOps({
      canonicalize: p =>
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
    expect(env.runCalls.some(call => call.command.includes('-exec grep'))).toBe(
      false,
    );
  });
});

describe('createPiRemoteOps configured file-tool paths', () => {
  it('batches policy-root canonicalization into one sandbox run per operation', async () => {
    const env = makeOps(
      {
        readBinary: filePath =>
          filePath === '/mnt/reference/info.txt'
            ? new TextEncoder().encode('reference')
            : null,
      },
      {
        fileToolPathPolicy: {
          readableRoots: ['/mnt/reference', '/mnt/other-reference'],
          writableRoots: ['/tmp'],
          deniedRoots: ['/tmp/private'],
        },
      },
    );

    await env.ops.readBuffer('/mnt/reference/info.txt');

    const policyRootCommands = env.runCalls.filter(call =>
      call.command.includes('__PI_POLICY_ROOT_'),
    );
    expect(env.runCalls).toHaveLength(1);
    expect(policyRootCommands).toHaveLength(1);
    expect(policyRootCommands[0]?.command).toContain("target='/mnt/reference'");
    expect(policyRootCommands[0]?.command).toContain("target='/tmp/private'");
  });

  it('allows external read/write/edit roots while preserving read-only and denied roots', async () => {
    const onFileChange = vi.fn();
    const env = makeOps(
      {
        readBinary: filePath => {
          if (filePath === '/mnt/reference/info.txt') {
            return new TextEncoder().encode('reference');
          }
          if (filePath === '/tmp/existing.txt') {
            return new TextEncoder().encode('old value');
          }
          return null;
        },
      },
      {
        fileToolPathPolicy: {
          readableRoots: ['/mnt/reference'],
          writableRoots: ['/tmp'],
          deniedRoots: ['/tmp/private'],
        },
        onFileChange,
      },
    );

    await expect(
      env.ops.readBuffer('/mnt/reference/info.txt'),
    ).resolves.toEqual(Buffer.from('reference'));
    await env.ops.writeFile('/tmp/new.txt', 'new value');
    await expect(
      env.ops.editFile('/tmp/existing.txt', 'old', 'updated'),
    ).resolves.toBe('updated value');

    expect(env.writeCalls).toEqual([
      { path: '/tmp/new.txt', content: 'new value' },
      { path: '/tmp/existing.txt', content: 'updated value' },
    ]);
    expect(onFileChange).not.toHaveBeenCalled();
    await expect(
      env.ops.writeFile('/mnt/reference/no-write.txt', 'no'),
    ).rejects.toThrow(/escapes the workspace/);
    await expect(env.ops.readBuffer('/tmp/private/token')).rejects.toThrow(
      /denied by the file-tool policy/,
    );
  });

  it('rechecks a missing write path through its nearest existing symlinked parent', async () => {
    const env = makeOps(
      {
        canonicalize: filePath =>
          filePath === '/tmp/link/missing/output.json'
            ? '/etc/missing/output.json'
            : filePath,
        readBinary: () => null,
      },
      {
        fileToolPathPolicy: { writableRoots: ['/tmp'] },
      },
    );

    await expect(
      env.ops.writeFile('/tmp/link/missing/output.json', '{}'),
    ).rejects.toThrow(/escapes the workspace/);
    expect(env.writeCalls).toEqual([]);
    expect(env.runCalls[0]?.command).toContain(
      'while [ ! -e "$dir" ] && [ ! -L "$dir" ]',
    );
    expect(env.runCalls[0]?.command).toContain(
      'resolved_dir=$(pi_resolve_path "$dir")',
    );
    expect(env.runCalls[0]?.command).not.toContain('realpath');
  });

  it('filters denied entries, prunes recursive tools, and formats grep paths by root', async () => {
    const env = makeOps(
      {
        run: command => {
          if (command.includes('ls -1A')) {
            return { stdout: 'private/\nvisible.txt\n' };
          }
          if (command.includes('-exec grep')) {
            return command.includes(`find '${sandboxWorkDir}'`)
              ? { stdout: `${sandboxWorkDir}/src/visible.ts:1:public\n` }
              : { stdout: '/tmp/visible.txt:1:public\n' };
          }
          if (command.includes(`find '/tmp'`)) {
            return { stdout: '/tmp/visible.txt\n' };
          }
          return {};
        },
      },
      {
        fileToolPathPolicy: {
          readableRoots: ['/tmp'],
          deniedRoots: ['/tmp/private', `${sandboxWorkDir}/secret`],
        },
      },
    );

    await expect(env.ops.listDirectory('/tmp')).resolves.toEqual([
      'visible.txt',
    ]);
    await expect(env.ops.findFiles('*', '/tmp')).resolves.toEqual([
      'visible.txt',
    ]);
    await expect(env.ops.grepFiles('public', { path: '/tmp' })).resolves.toBe(
      '/tmp/visible.txt:1:public',
    );
    await expect(env.ops.grepFiles('public', { path: '.' })).resolves.toBe(
      'src/visible.ts:1:public',
    );

    const recursiveCommands = env.runCalls
      .map(call => call.command)
      .filter(command => command.includes('find '));
    expect(recursiveCommands).toHaveLength(3);
    for (const command of recursiveCommands) {
      expect(command).not.toContain(' -L ');
    }

    const tmpCommands = recursiveCommands.filter(command =>
      command.includes("find '/tmp'"),
    );
    expect(tmpCommands).toHaveLength(2);
    for (const command of tmpCommands) {
      expect(command).toContain("\\( -path '/tmp/private' \\) -prune -o");
    }

    const grepCommands = recursiveCommands.filter(command =>
      command.includes('-exec grep'),
    );
    expect(grepCommands).toHaveLength(2);
    for (const command of grepCommands) {
      expect(command).not.toContain('grep -R');
    }
    expect(
      grepCommands.find(command =>
        command.includes(`find '${sandboxWorkDir}'`),
      ),
    ).toContain(`\\( -path '${sandboxWorkDir}/secret' \\) -prune -o`);
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
