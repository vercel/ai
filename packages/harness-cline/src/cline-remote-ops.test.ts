import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { createClineRemoteOps } from './cline-remote-ops';

const WORK_DIR = '/sandbox/work/cline-s1';

type RunInput = {
  command: string;
  workingDirectory?: string;
  abortSignal?: AbortSignal;
};

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function createFakeSandbox({
  files = new Map<string, string>(),
  run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
  realpath,
  existingPaths = new Set([WORK_DIR]),
}: {
  files?: Map<string, string>;
  run?: (input: RunInput) => Promise<RunResult>;
  realpath?: (inputPath: string) => string | null;
  existingPaths?: Set<string>;
} = {}) {
  const sandboxRun = vi.fn(async (input: RunInput) => {
    const realpathResult = mockRealpathCommand({
      command: input.command,
      files,
      existingPaths,
      realpath,
    });
    return realpathResult ?? run(input);
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
    run: sandboxRun,
    readTextFile,
    writeTextFile,
  } as unknown as Experimental_SandboxSession;
  return { sandbox, files, run: sandboxRun, readTextFile, writeTextFile };
}

function mockRealpathCommand({
  command,
  files,
  existingPaths,
  realpath,
}: {
  command: string;
  files: Map<string, string>;
  existingPaths: Set<string>;
  realpath: ((inputPath: string) => string | null) | undefined;
}): { exitCode: number; stdout: string; stderr: string } | undefined {
  if (!command.includes('realpath')) {
    return undefined;
  }

  const target = command.match(/target='([^']+)'/)?.[1];
  if (!target) {
    return { exitCode: 3, stdout: '__CLINE_REALPATH_FAILED__\n', stderr: '' };
  }

  const isWritableResolution = command.includes('missing="$base"');
  const resolved = realpath
    ? realpath(target)
    : isWritableResolution || files.has(target) || existingPaths.has(target)
      ? target
      : null;

  if (resolved === null) {
    return {
      exitCode: isWritableResolution ? 3 : 2,
      stdout: isWritableResolution
        ? '__CLINE_REALPATH_FAILED__\n'
        : '__CLINE_REALPATH_NOT_FOUND__\n',
      stderr: '',
    };
  }

  return { exitCode: 0, stdout: `${resolved}\n`, stderr: '' };
}

describe('resolvePath', () => {
  it('resolves relative paths against the work dir', () => {
    const { sandbox } = createFakeSandbox();
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    expect(ops.resolvePath('src/index.ts')).toBe(`${WORK_DIR}/src/index.ts`);
    expect(ops.resolvePath('./a/../b.txt')).toBe(`${WORK_DIR}/b.txt`);
  });

  it('keeps absolute paths inside the workspace', () => {
    const { sandbox } = createFakeSandbox();
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    expect(ops.resolvePath(`${WORK_DIR}/src/index.ts`)).toBe(
      `${WORK_DIR}/src/index.ts`,
    );
  });

  it('rejects absolute, traversal, sibling-session, and prefix escapes', () => {
    const { sandbox } = createFakeSandbox();
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });

    expect(() => ops.resolvePath('/etc/hosts')).toThrow(
      /escapes the workspace/,
    );
    expect(() => ops.resolvePath('../../../root/.ssh/id_ed25519')).toThrow(
      /escapes the workspace/,
    );
    expect(() => ops.resolvePath('../cline-s2/.env')).toThrow(
      /escapes the workspace/,
    );
    expect(() => ops.resolvePath(`${WORK_DIR}-other/.env`)).toThrow(
      /escapes the workspace/,
    );
  });

  it('allows workspace entries whose names begin with two dots', () => {
    const { sandbox } = createFakeSandbox();
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    expect(ops.resolvePath('..config')).toBe(`${WORK_DIR}/..config`);
  });
});

describe('file operations', () => {
  it('reads existing files and errors on missing ones', async () => {
    const { sandbox } = createFakeSandbox({
      files: new Map([[`${WORK_DIR}/a.txt`, 'contents']]),
    });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    expect(await ops.readFile('a.txt')).toBe('contents');
    await expect(ops.readFile('missing.txt')).rejects.toThrow(
      'File not found: missing.txt',
    );
  });

  it('writes files at resolved paths', async () => {
    const { sandbox, files } = createFakeSandbox();
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    await ops.writeFile('nested/b.txt', 'data');
    expect(files.get(`${WORK_DIR}/nested/b.txt`)).toBe('data');
  });

  it('edits by exact string replacement (first occurrence)', async () => {
    const { sandbox, files } = createFakeSandbox({
      files: new Map([[`${WORK_DIR}/c.txt`, 'one two one']]),
    });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    await ops.editFile('c.txt', 'one', 'ONE');
    expect(files.get(`${WORK_DIR}/c.txt`)).toBe('ONE two one');
  });

  it('errors when the edit target text is missing', async () => {
    const { sandbox } = createFakeSandbox({
      files: new Map([[`${WORK_DIR}/c.txt`, 'abc']]),
    });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    await expect(ops.editFile('c.txt', 'zzz', 'yyy')).rejects.toThrow(
      'Text to replace was not found in c.txt',
    );
  });

  it('rejects traversal through every file operation before sandbox I/O', async () => {
    const { sandbox, readTextFile, writeTextFile, run } = createFakeSandbox();
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    const siblingPath = '../cline-s2/.env';

    await expect(ops.readFile(siblingPath)).rejects.toThrow(
      /escapes the workspace/,
    );
    await expect(ops.writeFile(siblingPath, 'owned')).rejects.toThrow(
      /escapes the workspace/,
    );
    await expect(ops.editFile(siblingPath, 'a', 'b')).rejects.toThrow(
      /escapes the workspace/,
    );
    await expect(ops.grep('secret', { path: siblingPath })).rejects.toThrow(
      /escapes the workspace/,
    );
    await expect(ops.glob('*', siblingPath)).rejects.toThrow(
      /escapes the workspace/,
    );
    await expect(ops.ls(siblingPath)).rejects.toThrow(/escapes the workspace/);

    expect(readTextFile).not.toHaveBeenCalled();
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects symlinks that resolve outside the workspace', async () => {
    const linkedPath = `${WORK_DIR}/linked-secret`;
    const outsidePath = '/sandbox/work/cline-s2/.env';
    const { sandbox, readTextFile, writeTextFile } = createFakeSandbox({
      files: new Map([[outsidePath, 'SECRET=value']]),
      existingPaths: new Set([WORK_DIR, linkedPath]),
      realpath: inputPath =>
        inputPath === linkedPath ? outsidePath : inputPath,
    });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });

    await expect(ops.readFile('linked-secret')).rejects.toThrow(
      /escapes the workspace/,
    );
    await expect(ops.grep('SECRET', { path: 'linked-secret' })).rejects.toThrow(
      /escapes the workspace/,
    );
    await expect(ops.glob('*', 'linked-secret')).rejects.toThrow(
      /escapes the workspace/,
    );
    await expect(ops.ls('linked-secret')).rejects.toThrow(
      /escapes the workspace/,
    );
    await expect(ops.writeFile('linked-secret', 'owned')).rejects.toThrow(
      /escapes the workspace/,
    );
    await expect(
      ops.editFile('linked-secret', 'SECRET', 'owned'),
    ).rejects.toThrow(/escapes the workspace/);

    expect(readTextFile).not.toHaveBeenCalled();
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('rejects new writes whose closest existing ancestor escapes', async () => {
    const linkedPath = `${WORK_DIR}/linked-dir/new.txt`;
    const outsidePath = '/sandbox/work/cline-s2/new.txt';
    const { sandbox, writeTextFile } = createFakeSandbox({
      realpath: inputPath =>
        inputPath === linkedPath ? outsidePath : inputPath,
    });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });

    await expect(ops.writeFile('linked-dir/new.txt', 'owned')).rejects.toThrow(
      /escapes the workspace/,
    );
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('rejects writes through dangling symlinks', async () => {
    const linkedPath = `${WORK_DIR}/dangling-link`;
    const { sandbox, writeTextFile } = createFakeSandbox({
      existingPaths: new Set([WORK_DIR, linkedPath]),
      realpath: inputPath => (inputPath === linkedPath ? null : inputPath),
    });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });

    await expect(ops.writeFile('dangling-link', 'owned')).rejects.toThrow(
      /Unable to resolve path/,
    );
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('uses canonical targets when symlinks remain inside the workspace', async () => {
    const linkedPath = `${WORK_DIR}/linked-file`;
    const targetPath = `${WORK_DIR}/target.txt`;
    const { sandbox, files } = createFakeSandbox({
      files: new Map([[targetPath, 'original']]),
      existingPaths: new Set([WORK_DIR, linkedPath]),
      realpath: inputPath =>
        inputPath === linkedPath ? targetPath : inputPath,
    });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });

    expect(await ops.readFile('linked-file')).toBe('original');
    await ops.writeFile('linked-file', 'updated');
    expect(files.get(targetPath)).toBe('updated');
  });
});

describe('bash', () => {
  it('runs commands in the work dir and returns combined output', async () => {
    const run = vi.fn(async () => ({
      exitCode: 3,
      stdout: 'out',
      stderr: 'err',
    }));
    const { sandbox } = createFakeSandbox({ run });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    const result = await ops.bash('false');
    expect(result).toEqual({ output: 'outerr', exitCode: 3 });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'false', workingDirectory: WORK_DIR }),
    );
  });

  it('aborts on timeout', async () => {
    const run = vi.fn(
      async ({ abortSignal }: { abortSignal?: AbortSignal }) =>
        new Promise<RunResult>((_resolve, reject) => {
          abortSignal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const { sandbox } = createFakeSandbox({ run });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    await expect(ops.bash('sleep 60', { timeout: 0.01 })).rejects.toThrow(
      'aborted',
    );
  });
});

describe('glob', () => {
  it('filters find output through the glob pattern', async () => {
    const run = vi.fn(async () => ({
      exitCode: 0,
      stdout: [
        `${WORK_DIR}/src/index.ts`,
        `${WORK_DIR}/src/util.js`,
        `${WORK_DIR}/README.md`,
      ].join('\n'),
      stderr: '',
    }));
    const { sandbox } = createFakeSandbox({ run });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    expect(await ops.glob('**/*.ts')).toEqual(['src/index.ts']);
  });

  it('errors when the search path is missing', async () => {
    const run = vi.fn(async () => ({
      exitCode: 2,
      stdout: '__CLINE_FIND_NOT_FOUND__\n',
      stderr: '',
    }));
    const { sandbox } = createFakeSandbox({ run });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    await expect(ops.glob('*', 'missing')).rejects.toThrow(
      'Path not found: missing',
    );
  });
});

describe('ls', () => {
  it('lists, strips indicators, sorts, and limits entries', async () => {
    const run = vi.fn(async () => ({
      exitCode: 0,
      stdout: 'b.txt\nsub/\na.sh*\n',
      stderr: '',
    }));
    const { sandbox } = createFakeSandbox({ run });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    expect(await ops.ls('.', 2)).toEqual(['a.sh', 'b.txt']);
  });
});

describe('grep', () => {
  it('returns a friendly message when nothing matches', async () => {
    const run = vi.fn(async () => ({ exitCode: 1, stdout: '', stderr: '' }));
    const { sandbox } = createFakeSandbox({ run });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    expect(await ops.grep('needle')).toBe('No matches found');
  });

  it('does not follow symlinks discovered during recursive searches', async () => {
    const run = vi.fn(async (_input: RunInput) => ({
      exitCode: 1,
      stdout: '',
      stderr: '',
    }));
    const { sandbox } = createFakeSandbox({ run });
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });

    await ops.grep('needle');

    const grepCommand = run.mock.calls.find(([input]) =>
      input.command.includes('grep '),
    )?.[0].command;
    expect(grepCommand).toContain("grep '-r'");
    expect(grepCommand).not.toContain("'-R'");
  });
});
