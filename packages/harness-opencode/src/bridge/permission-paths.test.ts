import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  areFileToolPathsTrusted,
  areOpenCodePermissionPathsTrusted,
  areOpenCodePermissionPathsWriteProtected,
} from './permission-paths';

let directory: string;
let workDir: string;
let skills: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'harness-permission-paths-'));
  workDir = path.join(directory, 'workspace');
  skills = path.join(directory, 'skill');
  await mkdir(workDir);
  await mkdir(path.join(workDir, 'nested'));
  await mkdir(path.join(directory, 'other'));
  await mkdir(skills);
  await writeFile(path.join(workDir, 'file.txt'), 'workspace fixture');
  await writeFile(path.join(directory, 'other', 'file.txt'), 'other fixture');
  await symlink(path.join(directory, 'other'), path.join(workDir, 'external'));
  await symlink(path.join(workDir, 'nested'), path.join(workDir, 'internal'));
  await symlink(path.join(workDir, 'nested'), path.join(directory, 'alias'));
  await symlink(
    path.join(directory, 'missing'),
    path.join(workDir, 'dangling'),
  );
  await symlink('loop', path.join(workDir, 'loop'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('OpenCode file permission targets', () => {
  it.each([
    {
      action: 'read',
      toolCall: { nativeName: 'read', input: { filePath: 'file.txt' } },
      trusted: true,
    },
    {
      action: 'read',
      toolCall: {
        nativeName: 'read',
        input: { filePath: '../other/file.txt' },
      },
      trusted: false,
    },
    {
      action: 'read',
      toolCall: { nativeName: 'read', input: {} },
      trusted: false,
    },
    {
      action: 'glob',
      toolCall: { nativeName: 'glob', input: { pattern: '**/*.ts' } },
      trusted: true,
    },
    {
      action: 'grep',
      toolCall: {
        nativeName: 'grep',
        input: { pattern: 'text', path: '../other' },
      },
      trusted: false,
    },
    {
      action: 'external_directory',
      toolCall: {
        nativeName: 'write',
        input: { filePath: '../skill/new.txt' },
      },
      trusted: false,
    },
    { action: 'read', resources: ['../other/file.txt'], trusted: false },
    { action: 'glob', resources: ['**/*.ts'], trusted: false },
    {
      action: 'edit',
      metadata: {
        files: [{ filePath: 'file.txt' }, { filePath: '../other/file.txt' }],
      },
      trusted: false,
    },
    {
      action: 'edit',
      metadata: {
        files: [
          { filePath: 'file.txt', type: 'move', movePath: '../other/new.txt' },
        ],
      },
      trusted: false,
    },
    {
      action: 'edit',
      metadata: { files: [{ filePath: 'file.txt', type: 'move' }] },
      trusted: false,
    },
    {
      action: 'edit',
      metadata: {
        files: [{ filePath: 'file.txt', type: 'move', movePath: 'new.txt' }],
      },
      trusted: true,
    },
    { action: 'edit', metadata: { files: [] }, trusted: false },
  ])(
    'checks $action targets as trusted=$trusted',
    async ({ trusted, ...input }) => {
      await expect(
        areOpenCodePermissionPathsTrusted({
          resources: [],
          metadata: undefined,
          toolCall: undefined,
          ...input,
          workDir,
          readableSkillRoots: [skills],
        }),
      ).resolves.toBe(trusted);
    },
  );
});

describe('OpenCode write-protected permission targets', () => {
  it.each([
    {
      name: 'an unprotected edit',
      action: 'edit',
      metadata: { files: [{ filePath: 'file.txt' }] },
      writeProtected: false,
    },
    ...[
      '.agents/skills/test/SKILL.md',
      '.opencode/plugin/index.ts',
      'opencode.json',
      'opencode.jsonc',
      '.claude/skills/test/SKILL.md',
    ].map(filePath => ({
      name: `an edit of ${filePath}`,
      action: 'edit',
      metadata: { files: [{ filePath }] },
      writeProtected: true,
    })),
    {
      name: 'an edit of unrelated .claude configuration',
      action: 'edit',
      metadata: { files: [{ filePath: '.claude/settings.json' }] },
      writeProtected: false,
    },
    {
      name: 'a move into a protected directory',
      action: 'edit',
      metadata: {
        files: [
          {
            filePath: 'file.txt',
            type: 'move',
            movePath: '.agents/skills/moved/SKILL.md',
          },
        ],
      },
      writeProtected: true,
    },
    {
      name: 'a write tool call',
      action: 'edit',
      toolCall: { nativeName: 'write', input: { filePath: 'opencode.json' } },
      writeProtected: true,
    },
    {
      name: 'a read of a protected path',
      action: 'read',
      toolCall: { nativeName: 'read', input: { filePath: 'opencode.json' } },
      writeProtected: false,
    },
    {
      name: 'an edit without targets',
      action: 'edit',
      metadata: { files: [] },
      writeProtected: true,
    },
  ])(
    'reports $name as write-protected=$writeProtected',
    async ({ writeProtected, name: _name, ...input }) => {
      await expect(
        areOpenCodePermissionPathsWriteProtected({
          resources: [],
          metadata: undefined,
          toolCall: undefined,
          ...input,
          workDir,
          readableSkillRoots: [skills],
        }),
      ).resolves.toBe(writeProtected);
    },
  );
});

describe('file permission paths', () => {
  it.each([
    { target: 'file.txt', trusted: true },
    { target: 'nested/../file.txt', trusted: true },
    { target: '.', trusted: true },
    { target: '..config', trusted: true },
    { target: 'new/nested/file.txt', trusted: true },
    { target: 'internal/new.txt', trusted: true },
    { target: '../other/file.txt', trusted: false },
    { target: '../alias/../file.txt', trusted: false },
    { target: '../workspace-other/file.txt', trusted: false },
    { target: 'external/file.txt', trusted: false },
    { target: 'external/new/file.txt', trusted: false },
    { target: 'dangling', trusted: false },
    { target: 'dangling/new.txt', trusted: false },
    { target: 'loop', trusted: false },
    { target: 'file.txt/child', trusted: false },
    { target: 'missing/../file.txt', trusted: false },
    { target: '', trusted: false },
    { target: ' ', trusted: false },
    { target: 'file\0.txt', trusted: false },
  ])('checks $target as trusted=$trusted', async ({ target, trusted }) => {
    await expect(
      areFileToolPathsTrusted({
        workDir,
        cwd: workDir,
        paths: [target],
        access: 'write',
        readableSkillRoots: [],
      }),
    ).resolves.toBe(trusted);
  });
  it('checks every target and permits skill reads but not skill writes', async () => {
    const options = {
      workDir,
      cwd: workDir,
      access: 'read' as const,
      readableSkillRoots: [skills],
    };
    await expect(
      areFileToolPathsTrusted({ ...options, paths: [] }),
    ).resolves.toBe(false);
    await expect(
      areFileToolPathsTrusted({
        ...options,
        paths: ['file.txt', '../other/file.txt'],
      }),
    ).resolves.toBe(false);
    await expect(
      areFileToolPathsTrusted({
        ...options,
        paths: [path.join(skills, 'SKILL.md')],
      }),
    ).resolves.toBe(true);
    await expect(
      areFileToolPathsTrusted({
        ...options,
        access: 'write',
        paths: [path.join(skills, 'SKILL.md')],
      }),
    ).resolves.toBe(false);
    await expect(
      areFileToolPathsTrusted({
        ...options,
        paths: [path.join(directory, 'unrelated-skill', 'SKILL.md')],
      }),
    ).resolves.toBe(false);
  });
  it('compares canonical roots and resolves relative paths against the actual cwd', async () => {
    const alias = path.join(directory, 'workdir-alias');
    await symlink(workDir, alias);
    const options = {
      workDir: alias,
      cwd: workDir,
      access: 'read' as const,
      readableSkillRoots: [],
    };
    await expect(
      areFileToolPathsTrusted({
        ...options,
        paths: [path.join(workDir, 'file.txt')],
      }),
    ).resolves.toBe(true);
    await expect(
      areFileToolPathsTrusted({
        ...options,
        cwd: path.join(directory, 'other'),
        paths: ['file.txt'],
      }),
    ).resolves.toBe(false);
    await expect(
      areFileToolPathsTrusted({
        ...options,
        workDir: path.join(directory, 'missing'),
        paths: ['file.txt'],
      }),
    ).resolves.toBe(false);
  });
});
