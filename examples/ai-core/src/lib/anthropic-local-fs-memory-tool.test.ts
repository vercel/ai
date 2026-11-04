import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anthropicLocalFsMemoryTool } from './anthropic-local-fs-memory-tool';

describe('anthropicLocalFsMemoryTool', () => {
  let basePath: string;
  let execute: NonNullable<
    ReturnType<typeof anthropicLocalFsMemoryTool>['execute']
  >;
  const options = { toolCallId: 'test', messages: [] };

  beforeEach(async () => {
    basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-sdk-memory-'));
    execute = anthropicLocalFsMemoryTool({ basePath }).execute!;
    await fs.mkdir(path.join(basePath, 'memories-backup'));
    await fs.writeFile(
      path.join(basePath, 'memories-backup', 'note.txt'),
      'saved',
    );
    await fs.writeFile(path.join(basePath, 'memories', 'note.txt'), 'saved');
  });

  afterEach(async () => {
    await fs.rm(basePath, { recursive: true, force: true });
  });

  const invalidPaths = [
    '/memories/../memories-backup/note.txt',
    '/memories/nested/../../memories-backup/note.txt',
    '/memories/../note.txt',
    '/memories-backup/note.txt',
    '/memories.txt',
    '/memories\\note.txt',
    '/other/note.txt',
    'memories/note.txt',
  ];

  describe.each(invalidPaths)('rejects %s', invalidPath => {
    it.each([
      { command: 'view' },
      { command: 'create', file_text: 'changed' },
      { command: 'str_replace', old_str: 'saved', new_str: 'changed' },
      { command: 'insert', insert_line: 0, insert_text: 'changed' },
      { command: 'delete' },
    ] as const)('for $command', async action => {
      await expect(
        execute({ ...action, path: invalidPath }, options),
      ).rejects.toThrow(
        /would escape \/memories|Path must start with \/memories/,
      );

      expect(
        await fs.readFile(
          path.join(basePath, 'memories-backup', 'note.txt'),
          'utf-8',
        ),
      ).toBe('saved');
    });

    it('for rename sources', async () => {
      await expect(
        execute(
          {
            command: 'rename',
            old_path: invalidPath,
            new_path: '/memories/renamed.txt',
          },
          options,
        ),
      ).rejects.toThrow(
        /would escape \/memories|Path must start with \/memories/,
      );
    });

    it('for rename destinations', async () => {
      await expect(
        execute(
          {
            command: 'rename',
            old_path: '/memories/note.txt',
            new_path: invalidPath,
          },
          options,
        ),
      ).rejects.toThrow(
        /would escape \/memories|Path must start with \/memories/,
      );
      expect(
        await fs.readFile(path.join(basePath, 'memories', 'note.txt'), 'utf-8'),
      ).toBe('saved');
    });
  });

  it.each(['/memories', '/memories/'])(
    'allows viewing %s',
    async memoryPath => {
      expect(
        await execute({ command: 'view', path: memoryPath }, options),
      ).toBe(`Directory: ${memoryPath}\n- note.txt`);
    },
  );

  it('allows file operations and normalized paths inside the memory root', async () => {
    await execute(
      {
        command: 'create',
        path: '/memories/nested/../notes/note.txt',
        file_text: 'first',
      },
      options,
    );
    await execute(
      {
        command: 'str_replace',
        path: '/memories/notes/note.txt',
        old_str: 'first',
        new_str: 'updated',
      },
      options,
    );
    await execute(
      {
        command: 'insert',
        path: '/memories/notes/note.txt',
        insert_line: 1,
        insert_text: 'second',
      },
      options,
    );
    await execute(
      {
        command: 'rename',
        old_path: '/memories/notes/note.txt',
        new_path: '/memories/archive/note.txt',
      },
      options,
    );
    expect(
      await execute(
        { command: 'view', path: '/memories/archive/note.txt' },
        options,
      ),
    ).toBe('   1: updated\n   2: second');
    await execute(
      { command: 'delete', path: '/memories/archive/note.txt' },
      options,
    );
    expect(
      await fs.readdir(path.join(basePath, 'memories', 'archive')),
    ).toEqual([]);
  });
});
