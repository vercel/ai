import { execFile } from 'node:child_process';
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
import { promisify } from 'node:util';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSandboxWriteProtectedPath } from './is-sandbox-write-protected-path';

const WRITE_PROTECTION_TEST_ENTRIES = [
  '.agents/skills',
  '.claude',
  'config.json',
];

/*
 * Each case prepares a fresh working directory and names the workdir-relative
 * paths that a write tool call would touch. The tests for `isWriteProtectedPath`
 * in `@ai-sdk/harness/bridge` run the same cases, since both helpers must agree.
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

const execFileAsync = promisify(execFile);

function createLocalSandbox() {
  const run = vi.fn(async ({ command }: { command: string }) => {
    try {
      const result = await execFileAsync('bash', ['-c', command], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
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
  });
  return {
    run,
    sandbox: { run } as unknown as Experimental_SandboxSession,
  };
}

describe('isSandboxWriteProtectedPath', () => {
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
      const { sandbox } = createLocalSandbox();
      await expect(
        isSandboxWriteProtectedPath({
          sandbox,
          workDir,
          paths: testCase.paths.map(filePath => `${workDir}/${filePath}`),
          writeProtectedPaths: WRITE_PROTECTION_TEST_ENTRIES,
        }),
      ).resolves.toBe(testCase.protected);
    },
  );

  it('uses a single sandbox command when protected directories hold no symlinked directories', async () => {
    const workDir = await realpath(await createWorkDir());
    const { sandbox, run } = createLocalSandbox();
    await expect(
      isSandboxWriteProtectedPath({
        sandbox,
        workDir,
        paths: [`${workDir}/TEST.md`],
        writeProtectedPaths: WRITE_PROTECTION_TEST_ENTRIES,
      }),
    ).resolves.toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('reports failed or malformed sandbox output as protected', async () => {
    const workDir = await createWorkDir();
    for (const result of [
      { exitCode: 1, stdout: '', stderr: 'failed' },
      { exitCode: 0, stdout: 'W not-base64\nE\n', stderr: '' },
      { exitCode: 0, stdout: '', stderr: '' },
    ]) {
      const sandbox = {
        run: vi.fn(async () => result),
      } as unknown as Experimental_SandboxSession;
      await expect(
        isSandboxWriteProtectedPath({
          sandbox,
          workDir,
          paths: [`${workDir}/TEST.md`],
          writeProtectedPaths: WRITE_PROTECTION_TEST_ENTRIES,
        }),
      ).resolves.toBe(true);
    }
  });

  it('reports empty and relative paths as protected', async () => {
    const workDir = await createWorkDir();
    const { sandbox, run } = createLocalSandbox();
    for (const paths of [[], [''], ['TEST.md']]) {
      await expect(
        isSandboxWriteProtectedPath({
          sandbox,
          workDir,
          paths,
          writeProtectedPaths: WRITE_PROTECTION_TEST_ENTRIES,
        }),
      ).resolves.toBe(true);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects invalid protected path entries', async () => {
    const workDir = await createWorkDir();
    const { sandbox } = createLocalSandbox();
    await expect(
      isSandboxWriteProtectedPath({
        sandbox,
        workDir,
        paths: [`${workDir}/TEST.md`],
        writeProtectedPaths: ['../outside'],
      }),
    ).rejects.toThrow(TypeError);
  });
});
