import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { areFileToolPathsTrusted } from './permission-paths';

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

describe('file permission paths', () => {
  it.each([
    { target: 'file.txt', trusted: true },
    { target: 'nested/../file.txt', trusted: true },
    { target: '.', trusted: true },
    { target: '..config', trusted: true },
    { target: '~notes/file.txt', trusted: true },
    { target: 'nested/file name.txt', trusted: true },
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
    { target: '~', trusted: false },
    { target: '~/file.txt', trusted: false },
    { target: ' ~/file.txt ', trusted: false },
    { target: ' file.txt', trusted: false },
    { target: 'file.txt ', trusted: false },
    { target: '\tfile.txt\n', trusted: false },
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
  it.each(['read', 'write'] as const)(
    'requires approval for whitespace-wrapped absolute paths on %s',
    async access => {
      await expect(
        areFileToolPathsTrusted({
          workDir,
          cwd: workDir,
          paths: [` ${path.join(directory, 'other', 'file.txt')} `],
          access,
          readableSkillRoots: [],
        }),
      ).resolves.toBe(false);
    },
  );
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

  describe('additional directories', () => {
    let shared: string;
    beforeEach(async () => {
      shared = path.join(directory, 'shared');
      await mkdir(shared);
      await mkdir(path.join(directory, 'shared-evil'));
      await writeFile(path.join(shared, 'file.txt'), 'shared fixture');
      await symlink(path.join(directory, 'other'), path.join(shared, 'escape'));
    });

    const trusted = (
      paths: string[],
      options: {
        access?: 'read' | 'write';
        additionalDirectories?: string[];
        cwd?: string;
      } = {},
    ) =>
      areFileToolPathsTrusted({
        workDir,
        cwd: options.cwd ?? workDir,
        paths,
        access: options.access ?? 'read',
        readableSkillRoots: [],
        additionalDirectories: options.additionalDirectories ?? [shared],
      });

    it.each(['read', 'write'] as const)(
      'trusts %s access inside an additional directory',
      async access => {
        await expect(
          trusted([path.join(shared, 'file.txt')], { access }),
        ).resolves.toBe(true);
        await expect(
          trusted([path.join(shared, 'new', 'file.txt')], { access }),
        ).resolves.toBe(true);
        await expect(
          trusted(['file.txt'], { access, cwd: shared }),
        ).resolves.toBe(true);
      },
    );

    it.each([
      {
        name: 'a sibling that shares the prefix',
        target: () => path.join(directory, 'shared-evil', 'file.txt'),
      },
      {
        name: 'a parent traversal out of it',
        target: () => path.join(shared, '..', 'other', 'file.txt'),
      },
      {
        name: 'a symlink inside it that points outside',
        target: () => path.join(shared, 'escape', 'file.txt'),
      },
      {
        name: 'an unrelated directory',
        target: () => path.join(directory, 'other', 'file.txt'),
      },
    ])('does not trust $name', async ({ target }) => {
      await expect(trusted([target()])).resolves.toBe(false);
      await expect(trusted([target()], { access: 'write' })).resolves.toBe(
        false,
      );
    });

    it('ignores relative additional directories', async () => {
      await expect(
        trusted([path.join(directory, 'other', 'file.txt')], {
          additionalDirectories: ['../other'],
        }),
      ).resolves.toBe(false);
    });

    it('ignores additional directories that do not exist', async () => {
      await expect(
        trusted([path.join(directory, 'missing', 'file.txt')], {
          additionalDirectories: [path.join(directory, 'missing')],
        }),
      ).resolves.toBe(false);
    });

    it('requires every path to be trusted', async () => {
      await expect(
        trusted([
          path.join(shared, 'file.txt'),
          path.join(directory, 'other', 'file.txt'),
        ]),
      ).resolves.toBe(false);
    });
  });
});
