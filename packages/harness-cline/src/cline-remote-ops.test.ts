import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { createClineRemoteOps } from './cline-remote-ops';

const WORK_DIR = '/sandbox/work/cline-s1';

function createFakeSandbox({
  files = new Map<string, string>(),
  run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
}: {
  files?: Map<string, string>;
  run?: ReturnType<typeof vi.fn>;
} = {}) {
  const sandbox = {
    run,
    readTextFile: async ({ path }: { path: string }) => files.get(path) ?? null,
    writeTextFile: async ({
      path,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      files.set(path, content);
    },
  } as unknown as Experimental_SandboxSession;
  return { sandbox, files, run };
}

describe('resolvePath', () => {
  it('resolves relative paths against the work dir', () => {
    const { sandbox } = createFakeSandbox();
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    expect(ops.resolvePath('src/index.ts')).toBe(`${WORK_DIR}/src/index.ts`);
    expect(ops.resolvePath('./a/../b.txt')).toBe(`${WORK_DIR}/b.txt`);
  });

  it('keeps absolute paths', () => {
    const { sandbox } = createFakeSandbox();
    const ops = createClineRemoteOps({ sandbox, workDir: WORK_DIR });
    expect(ops.resolvePath('/etc/hosts')).toBe('/etc/hosts');
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
        new Promise((_resolve, reject) => {
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
});
