import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApplyPatchExecutor } from './apply-patch-file-editor';

describe('apply patch file editor', () => {
  let temporaryRoot: string;
  let workspace: string;
  let sibling: string;

  beforeEach(async () => {
    temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), 'ai-sdk-patch-test-'));
    workspace = path.join(temporaryRoot, 'workspace');
    sibling = path.join(temporaryRoot, 'workspace-other');
    await fs.mkdir(workspace);
    await fs.mkdir(sibling);
    await fs.writeFile(path.join(sibling, 'sentinel.md'), 'sentinel\n');
  });

  afterEach(async () => {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  it('creates, updates, and deletes nested workspace files', async () => {
    const execute = createApplyPatchExecutor(workspace);
    const filePath = 'nested/notes.md';
    expect(
      await execute({
        callId: 'create',
        operation: { type: 'create_file', path: filePath, diff: '+first\n' },
      }),
    ).toMatchObject({ status: 'completed' });
    expect(
      await execute({
        callId: 'update',
        operation: {
          type: 'update_file',
          path: filePath,
          diff: '@@\n-first\n+second\n',
        },
      }),
    ).toMatchObject({ status: 'completed' });
    expect(await fs.readFile(path.join(workspace, filePath), 'utf8')).toBe(
      'second',
    );
    expect(
      await execute({
        callId: 'delete',
        operation: { type: 'delete_file', path: filePath },
      }),
    ).toMatchObject({ status: 'completed' });
    await expect(fs.stat(path.join(workspace, filePath))).rejects.toMatchObject(
      { code: 'ENOENT' },
    );
  });

  it('allows ordinary workspace filenames beginning with two dots', async () => {
    expect(
      await createApplyPatchExecutor(workspace)({
        callId: 'create',
        operation: {
          type: 'create_file',
          path: '..notes.md',
          diff: '+notes\n',
        },
      }),
    ).toMatchObject({ status: 'completed' });
    expect(await fs.readFile(path.join(workspace, '..notes.md'), 'utf8')).toBe(
      'notes',
    );
  });

  it.each(['create_file', 'update_file', 'delete_file'] as const)(
    'rejects sibling-prefix paths for %s',
    async type => {
      const target = path.relative(
        workspace,
        path.join(sibling, 'sentinel.md'),
      );
      const operation =
        type === 'delete_file'
          ? { type, path: target }
          : {
              type,
              path: target,
              diff:
                type === 'create_file'
                  ? '+changed\n'
                  : '@@\n-sentinel\n+changed\n',
            };
      expect(
        await createApplyPatchExecutor(workspace)({
          callId: 'outside',
          operation,
        }),
      ).toMatchObject({ status: 'failed' });
      expect(await fs.readFile(path.join(sibling, 'sentinel.md'), 'utf8')).toBe(
        'sentinel\n',
      );
    },
  );

  it('rejects absolute paths outside the workspace', async () => {
    expect(
      await createApplyPatchExecutor(workspace)({
        callId: 'outside',
        operation: {
          type: 'delete_file',
          path: path.join(sibling, 'sentinel.md'),
        },
      }),
    ).toMatchObject({ status: 'failed' });
    expect(await fs.readFile(path.join(sibling, 'sentinel.md'), 'utf8')).toBe(
      'sentinel\n',
    );
  });

  it('rejects directory symlinks pointing outside the workspace', async () => {
    await fs.symlink(sibling, path.join(workspace, 'linked'), 'junction');
    expect(
      await createApplyPatchExecutor(workspace)({
        callId: 'symlink',
        operation: { type: 'delete_file', path: 'linked/sentinel.md' },
      }),
    ).toMatchObject({ status: 'failed' });
    expect(await fs.readFile(path.join(sibling, 'sentinel.md'), 'utf8')).toBe(
      'sentinel\n',
    );
  });
});
