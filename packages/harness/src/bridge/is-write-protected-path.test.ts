import {
  link,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isWriteProtectedPath } from './is-write-protected-path';

const WRITE_PROTECTION_TEST_ENTRIES = [
  '.agents/skills',
  '.claude',
  'config.json',
];

/*
 * Each case prepares a fresh working directory and names the workdir-relative
 * paths that a write tool call would touch. The tests for
 * `isSandboxWriteProtectedPath` in `@ai-sdk/harness/utils` run the same cases,
 * since both helpers must agree.
 */
const WRITE_PROTECTION_TEST_CASES: ReadonlyArray<{
  name: string;
  setup?: (workDir: string) => Promise<void>;
  paths: string[];
  protected: boolean;
}> = [
  {
    name: 'an unprotected file',
    setup: withSkill,
    paths: ['TEST.md'],
    protected: false,
  },
  {
    name: 'a file inside a protected directory',
    setup: withSkill,
    paths: ['.agents/skills/test/SKILL.md'],
    protected: true,
  },
  {
    name: 'a new file inside a missing protected directory',
    paths: ['.claude/settings.json'],
    protected: true,
  },
  {
    name: 'a protected file',
    paths: ['config.json'],
    protected: true,
  },
  {
    name: 'a parent of a protected directory',
    setup: withSkill,
    paths: ['.agents'],
    protected: true,
  },
  {
    name: 'a sibling sharing a protected name prefix',
    setup: withSkill,
    paths: ['.agents/skills-other/file.md'],
    protected: false,
  },
  {
    name: 'any of several paths',
    setup: withSkill,
    paths: ['TEST.md', '.agents/skills/test/SKILL.md'],
    protected: true,
  },
  {
    name: 'an alias that points into a protected directory',
    setup: async workDir => {
      await withSkill(workDir);
      await symlink('.agents/skills', path.join(workDir, 'skills'));
    },
    paths: ['skills/test/SKILL.md'],
    protected: true,
  },
  {
    name: 'the target of a symlink inside a protected directory',
    setup: async workDir => {
      await withSkill(workDir);
      await mkdir(path.join(workDir, 'shared'));
      await symlink(
        '../../shared',
        path.join(workDir, '.agents/skills/shared'),
      );
    },
    paths: ['shared/new.md'],
    protected: true,
  },
  {
    name: 'a target reached through nested symlinks',
    setup: async workDir => {
      await withSkill(workDir);
      await mkdir(path.join(workDir, 'first'));
      await mkdir(path.join(workDir, 'second'));
      await symlink('../../first', path.join(workDir, '.agents/skills/first'));
      await symlink('../second', path.join(workDir, 'first/second'));
    },
    paths: ['second/new.md'],
    protected: true,
  },
  {
    name: 'a file targeted by a symlink inside a protected directory',
    setup: async workDir => {
      await withSkill(workDir);
      await writeFile(path.join(workDir, 'notes.md'), 'notes\n');
      await symlink(
        '../../notes.md',
        path.join(workDir, '.agents/skills/notes.md'),
      );
    },
    paths: ['notes.md'],
    protected: true,
  },
  {
    name: 'a hard-linked file while a protected path exists',
    setup: async workDir => {
      await withSkill(workDir);
      await link(
        path.join(workDir, '.agents/skills/test/SKILL.md'),
        path.join(workDir, 'hard.md'),
      );
    },
    paths: ['hard.md'],
    protected: true,
  },
  {
    name: 'a hard-linked file while no protected path exists',
    setup: async workDir => {
      await writeFile(path.join(workDir, 'one.md'), 'one\n');
      await link(path.join(workDir, 'one.md'), path.join(workDir, 'two.md'));
    },
    paths: ['two.md'],
    protected: false,
  },
  {
    name: 'any write while a protected directory holds a dangling symlink',
    setup: async workDir => {
      await withSkill(workDir);
      await symlink('missing', path.join(workDir, '.agents/skills/dangling'));
    },
    paths: ['TEST.md'],
    protected: true,
  },
  {
    name: 'a looping symlink',
    setup: async workDir => {
      await symlink('loop-b', path.join(workDir, 'loop-a'));
      await symlink('loop-a', path.join(workDir, 'loop-b'));
    },
    paths: ['loop-a'],
    protected: true,
  },
  {
    name: 'a normalized parent component after a symlink',
    setup: async workDir => {
      await withSkill(workDir);
      await mkdir(path.join(workDir, 'deep/nested'), { recursive: true });
      await symlink('deep/nested', path.join(workDir, 'link'));
    },
    paths: ['link/../.agents/skills/new.md'],
    protected: true,
  },
  {
    name: 'any write when protected directories exceed the scan limit',
    setup: async workDir => {
      await mkdir(path.join(workDir, '.agents/skills/many'), {
        recursive: true,
      });
      await Promise.all(
        Array.from({ length: 2001 }, (_, index) =>
          writeFile(path.join(workDir, `.agents/skills/many/${index}.md`), ''),
        ),
      );
    },
    paths: ['TEST.md'],
    protected: true,
  },
];

async function withSkill(workDir: string): Promise<void> {
  await mkdir(path.join(workDir, '.agents/skills/test'), { recursive: true });
  await writeFile(
    path.join(workDir, '.agents/skills/test/SKILL.md'),
    '---\nname: test\ndescription: Test skill.\n---\n',
  );
}

describe('isWriteProtectedPath', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map(directory => rm(directory, { recursive: true, force: true })),
    );
  });

  async function createWorkDir(): Promise<string> {
    const directory = await mkdtemp(path.join(tmpdir(), 'write-protection-'));
    directories.push(directory);
    return directory;
  }

  it.each(WRITE_PROTECTION_TEST_CASES)(
    'reports $name as protected: $protected',
    async testCase => {
      const workDir = await createWorkDir();
      await testCase.setup?.(workDir);
      await expect(
        isWriteProtectedPath({
          workDir,
          paths: testCase.paths,
          writeProtectedPaths: WRITE_PROTECTION_TEST_ENTRIES,
        }),
      ).resolves.toBe(testCase.protected);
    },
  );

  it('resolves relative paths against cwd', async () => {
    const workDir = await createWorkDir();
    await mkdir(path.join(workDir, '.claude'));
    await expect(
      isWriteProtectedPath({
        workDir,
        cwd: path.join(workDir, '.claude'),
        paths: ['settings.json'],
        writeProtectedPaths: WRITE_PROTECTION_TEST_ENTRIES,
      }),
    ).resolves.toBe(true);
  });

  it('accepts absolute paths', async () => {
    const workDir = await realpath(await createWorkDir());
    await expect(
      isWriteProtectedPath({
        workDir,
        paths: [path.join(workDir, '.claude/settings.json')],
        writeProtectedPaths: WRITE_PROTECTION_TEST_ENTRIES,
      }),
    ).resolves.toBe(true);
  });

  it.each([
    { name: 'no paths', paths: [] },
    { name: 'an empty path', paths: [''] },
    {
      name: 'a relative path without an absolute cwd',
      paths: ['TEST.md'],
      cwd: 'relative',
    },
  ])('reports $name as protected', async ({ paths, cwd }) => {
    const workDir = await createWorkDir();
    await expect(
      isWriteProtectedPath({
        workDir,
        cwd,
        paths,
        writeProtectedPaths: WRITE_PROTECTION_TEST_ENTRIES,
      }),
    ).resolves.toBe(true);
  });

  it('rejects invalid protected path entries', async () => {
    const workDir = await createWorkDir();
    for (const entry of ['', '/etc', '../outside', 'a/./b', 'a//b']) {
      await expect(
        isWriteProtectedPath({
          workDir,
          paths: ['TEST.md'],
          writeProtectedPaths: [entry],
        }),
      ).rejects.toThrow(TypeError);
    }
  });
});
