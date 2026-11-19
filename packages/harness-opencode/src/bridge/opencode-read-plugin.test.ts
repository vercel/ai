import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import harnessReadPlugin from './opencode-read-plugin';

let root: string;
let workdir: string;
const marker = 'OUTSIDE_INSTRUCTION_MARKER';
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'harness-read-'));
  workdir = path.join(root, 'repo');
  await mkdir(path.join(workdir, 'nested'), { recursive: true });
  await writeFile(
    path.join(workdir, 'nested', 'source.txt'),
    'first\nsecond\nthird\n',
  );
  await writeFile(path.join(root, 'secret'), marker);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function reader(ask = vi.fn(async (_request: unknown) => {})) {
  const plugin = await harnessReadPlugin();
  const context = {
    directory: workdir,
    worktree: workdir,
    abort: new AbortController().signal,
    ask,
  };
  return {
    read: (args: Parameters<typeof plugin.tool.read.execute>[0]) =>
      plugin.tool.read.execute(args, context),
    ask,
  };
}

describe('restrictive OpenCode read override', () => {
  it.each(['relative', 'absolute', 'inside', 'dangling', 'loop', 'regular'])(
    'never discovers a %s nested instruction',
    async kind => {
      const instruction = path.join(workdir, 'nested', 'AGENTS.md');
      if (kind === 'regular') await writeFile(instruction, marker);
      else
        await symlink(
          {
            relative: '../../secret',
            absolute: path.join(root, 'secret'),
            inside: 'source.txt',
            dangling: '../../missing',
            loop: 'AGENTS.md',
          }[kind]!,
          instruction,
        );
      const { read, ask } = await reader();
      const result = await read({ filePath: 'nested/source.txt' });
      expect(result.output).toContain('1: first');
      expect(result.output).not.toContain(marker);
      expect(result.output).not.toContain('Instructions from:');
      expect(result.metadata.loaded).toEqual([]);
      expect(ask).toHaveBeenCalledExactlyOnceWith({
        permission: 'read',
        patterns: [path.join(workdir, 'nested', 'source.txt')],
        always: ['*'],
        metadata: { filepath: path.join(workdir, 'nested', 'source.txt') },
      });
    },
  );

  it('ignores instructions through a symlinked ancestor', async () => {
    await symlink('../nested', path.join(workdir, 'nested', 'alias'));
    await symlink('../../secret', path.join(workdir, 'nested', 'AGENTS.md'));
    const { read } = await reader();
    expect(
      (await read({ filePath: 'nested/alias/source.txt' })).output,
    ).not.toContain(marker);
  });

  it('does not race an instruction replacement after permission approval', async () => {
    const instruction = path.join(workdir, 'nested', 'AGENTS.md');
    await writeFile(instruction, 'safe');
    const { read } = await reader(
      vi.fn(async () => {
        await unlink(instruction);
        await symlink('../../secret', instruction);
      }),
    );
    expect(
      (await read({ filePath: 'nested/source.txt' })).output,
    ).not.toContain(marker);
    expect(await readFile(instruction, 'utf8')).toBe(marker);
  });

  it('does not open the requested file when permission is denied', async () => {
    const { read } = await reader(
      vi.fn(async () => {
        throw new Error('approval denied');
      }),
    );
    await expect(read({ filePath: '../secret' })).rejects.toThrow(
      'approval denied',
    );
    await expect(read({ filePath: 'missing' })).rejects.toThrow(
      'approval denied',
    );
  });

  it('reads an explicitly approved outside path', async () => {
    const { read } = await reader();
    expect((await read({ filePath: '../secret' })).output).toContain(marker);
  });

  it('preserves offset and limit and marks truncated output', async () => {
    const { read } = await reader();
    const result = await read({
      filePath: 'nested/source.txt',
      offset: 2,
      limit: 1,
    });
    expect(result.output).toContain('2: second');
    expect(result.output).not.toContain('first');
    expect(result.output).not.toContain('third');
    expect(result.metadata.truncated).toBe(true);
  });

  it('lists directories without opening their instruction entries', async () => {
    await symlink('../../secret', path.join(workdir, 'nested', 'AGENTS.md'));
    const { read } = await reader();
    const result = await read({ filePath: 'nested' });
    expect(result.output).toContain('AGENTS.md');
    expect(result.output).not.toContain(marker);
  });

  it('preserves image attachments without loading instructions', async () => {
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    await writeFile(path.join(workdir, 'nested', 'image.png'), image);
    await symlink('../../secret', path.join(workdir, 'nested', 'AGENTS.md'));
    const { read } = await reader();
    const result = await read({ filePath: 'nested/image.png' });
    expect(result.attachments).toEqual([
      {
        type: 'file',
        mime: 'image/png',
        url: `data:image/png;base64,${image.toString('base64')}`,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(marker);
  });

  it.each(['CLAUDE.md', 'CONTEXT.md'])(
    'does not discover %s either',
    async name => {
      await symlink('../../secret', path.join(workdir, 'nested', name));
      const { read } = await reader();
      expect(
        (await read({ filePath: 'nested/source.txt' })).output,
      ).not.toContain(marker);
    },
  );

  it('continues to read an explicitly requested in-workdir symlink', async () => {
    await symlink('source.txt', path.join(workdir, 'nested', 'link'));
    const { read } = await reader();
    expect((await read({ filePath: 'nested/link' })).output).toContain('first');
  });

  it('bounds text output by bytes and lines', async () => {
    await writeFile(
      path.join(workdir, 'large'),
      ('x'.repeat(1000) + '\n').repeat(100),
    );
    const { read } = await reader();
    const result = await read({ filePath: 'large' });
    expect(result.metadata.truncated).toBe(true);
    expect(Buffer.byteLength(result.output)).toBeLessThan(52 * 1024);
    await writeFile(path.join(workdir, 'many'), 'x\n'.repeat(3000));
    const many = await read({ filePath: 'many' });
    expect(many.metadata.truncated).toBe(true);
    expect(many.output).toContain('2000: x');
    expect(many.output).not.toContain('2001: x');
  });

  it('rejects unsupported binary files', async () => {
    await writeFile(path.join(workdir, 'binary'), Buffer.from([1, 0, 2]));
    const { read } = await reader();
    await expect(read({ filePath: 'binary' })).rejects.toThrow('Binary files');
  });
});
