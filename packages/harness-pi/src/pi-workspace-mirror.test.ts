import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncHostWorkspaceFromSandbox } from './pi-workspace-mirror';

const sandboxWorkDir = '/sandbox/work';

function makeSandbox(
  remoteListing: {
    directories: string[];
    files: Record<string, string>;
  },
  options?: {
    rejectFindSymlinkFlags?: boolean;
  },
): {
  sandbox: Experimental_SandboxSession;
  run: ReturnType<typeof vi.fn>;
  readBinaryFile: ReturnType<typeof vi.fn>;
} {
  const listOutput = [
    ...remoteListing.directories.map(d => `d\t${d}`),
    ...Object.keys(remoteListing.files).map(
      f => `f\t${f}\t${path.posix.join(sandboxWorkDir, f)}`,
    ),
  ]
    .sort()
    .join('\n');

  const run = vi.fn(async ({ command }: { command: string }) =>
    options?.rejectFindSymlinkFlags && command.includes('find -L')
      ? {
          exitCode: 0,
          stdout: '',
          stderr: "find: unknown predicate '-L'\n",
        }
      : {
          exitCode: 0,
          stdout: listOutput,
          stderr: '',
        },
  );
  const readBinaryFile = vi.fn(
    async ({ path: requestedPath }: { path: string }) => {
      const relative = path.posix.relative(sandboxWorkDir, requestedPath);
      const content = remoteListing.files[relative];
      return content == null ? null : new TextEncoder().encode(content);
    },
  );

  const sandbox = {
    description: 'mock',
    run,
    readBinaryFile,
    readFile: vi.fn(),
    readTextFile: vi.fn(),
    writeFile: vi.fn(),
    writeBinaryFile: vi.fn(),
    writeTextFile: vi.fn(),
    spawn: vi.fn(),
  } as unknown as Experimental_SandboxSession;

  return { sandbox, run, readBinaryFile };
}

let hostWorkDir: string;

beforeEach(() => {
  hostWorkDir = mkdtempSync(path.join(tmpdir(), 'pi-wmirror-'));
});

afterEach(() => {
  rmSync(hostWorkDir, { recursive: true, force: true });
});

describe('syncHostWorkspaceFromSandbox', () => {
  it('mirrors the .pi config subtree and root context files', async () => {
    const { sandbox } = makeSandbox({
      directories: ['.pi', '.pi/skills', '.pi/skills/demo'],
      files: {
        '.pi/skills/demo/SKILL.md': '# Demo skill',
        'AGENTS.md': '# Project agents',
      },
    });
    await syncHostWorkspaceFromSandbox({
      sandbox,
      sandboxWorkDir,
      hostWorkDir,
    });
    expect(
      readFileSync(path.join(hostWorkDir, '.pi/skills/demo/SKILL.md'), 'utf8'),
    ).toBe('# Demo skill');
    expect(readFileSync(path.join(hostWorkDir, 'AGENTS.md'), 'utf8')).toBe(
      '# Project agents',
    );
  });

  it('mirrors .pi config when sandbox find rejects symlink-following flags', async () => {
    const { sandbox } = makeSandbox(
      {
        directories: ['.pi'],
        files: {
          '.pi/SYSTEM.md': '# Project system prompt',
        },
      },
      { rejectFindSymlinkFlags: true },
    );

    await syncHostWorkspaceFromSandbox({
      sandbox,
      sandboxWorkDir,
      hostWorkDir,
    });

    expect(readFileSync(path.join(hostWorkDir, '.pi/SYSTEM.md'), 'utf8')).toBe(
      '# Project system prompt',
    );
  });

  it('mirrors shallow config trees with many siblings in just-bash', async () => {
    const sandboxSession = await createJustBashSandbox({
      cwd: sandboxWorkDir,
    }).createSession();
    const sandbox = sandboxSession.restricted();

    try {
      const setupResult = await sandbox.run({
        command: [
          'mkdir -p .pi',
          'i=0',
          'while [ "$i" -lt 101 ]; do',
          '  mkdir -p ".pi/group-$i"',
          `  printf 'prompt %s' "$i" > ".pi/group-$i/SYSTEM.md"`,
          '  i=$((i + 1))',
          'done',
        ].join('\n'),
        workingDirectory: sandboxWorkDir,
      });
      expect(setupResult.exitCode).toBe(0);

      await syncHostWorkspaceFromSandbox({
        sandbox,
        sandboxWorkDir,
        hostWorkDir,
      });

      expect(
        readFileSync(path.join(hostWorkDir, '.pi/group-100/SYSTEM.md'), 'utf8'),
      ).toBe('prompt 100');
    } finally {
      await sandboxSession.destroy?.();
    }
  });

  it('mirrors deeply nested acyclic config trees in just-bash', async () => {
    const sandboxSession = await createJustBashSandbox({
      cwd: sandboxWorkDir,
    }).createSession();
    const sandbox = sandboxSession.restricted();

    try {
      const setupResult = await sandbox.run({
        command: [
          'mkdir -p .pi',
          'deep_path=.pi',
          'i=0',
          'while [ "$i" -lt 101 ]; do',
          '  deep_path=$deep_path/level-$i',
          '  mkdir "$deep_path"',
          '  i=$((i + 1))',
          'done',
          `printf 'deep prompt' > "$deep_path/SYSTEM.md"`,
        ].join('\n'),
        workingDirectory: sandboxWorkDir,
      });
      expect(setupResult.exitCode).toBe(0);

      await syncHostWorkspaceFromSandbox({
        sandbox,
        sandboxWorkDir,
        hostWorkDir,
      });

      const deepPath = Array.from(
        { length: 101 },
        (_, index) => `level-${index}`,
      );
      expect(
        readFileSync(
          path.join(hostWorkDir, '.pi', ...deepPath, 'SYSTEM.md'),
          'utf8',
        ),
      ).toBe('deep prompt');
    } finally {
      await sandboxSession.destroy?.();
    }
  });

  it('mirrors the .agents config subtree, resolving symlinked targets', async () => {
    // `.agents/skills` is a symlink to a `skills` directory elsewhere; the
    // sandbox traversal resolves it so the listing reports the real files
    // through the symlinked path.
    const { sandbox } = makeSandbox({
      directories: ['.agents', '.agents/skills', '.agents/skills/demo'],
      files: {
        '.agents/skills/demo/SKILL.md': '# Linked skill',
      },
    });
    await syncHostWorkspaceFromSandbox({
      sandbox,
      sandboxWorkDir,
      hostWorkDir,
    });
    expect(
      readFileSync(
        path.join(hostWorkDir, '.agents/skills/demo/SKILL.md'),
        'utf8',
      ),
    ).toBe('# Linked skill');
  });

  it('mirrors nested files below symlinked config directories in just-bash', async () => {
    const sandboxSession = await createJustBashSandbox({
      cwd: sandboxWorkDir,
    }).createSession();
    const sandbox = sandboxSession.restricted();

    try {
      const setupResult = await sandbox.run({
        command: [
          'mkdir -p .agents project-skills/demo',
          `printf '# Linked skill' > project-skills/demo/SKILL.md`,
          'ln -s ../project-skills .agents/skills',
        ].join('\n'),
        workingDirectory: sandboxWorkDir,
      });
      expect(setupResult.exitCode).toBe(0);

      await syncHostWorkspaceFromSandbox({
        sandbox,
        sandboxWorkDir,
        hostWorkDir,
      });

      expect(
        readFileSync(
          path.join(hostWorkDir, '.agents/skills/demo/SKILL.md'),
          'utf8',
        ),
      ).toBe('# Linked skill');
    } finally {
      await sandboxSession.destroy?.();
    }
  });

  it('skips config symlinks that resolve to the filesystem root in just-bash', async () => {
    const sandboxSession = await createJustBashSandbox({
      cwd: sandboxWorkDir,
    }).createSession();
    const sandbox = sandboxSession.restricted();

    try {
      const setupResult = await sandbox.run({
        command: 'ln -s / .pi',
        workingDirectory: sandboxWorkDir,
      });
      expect(setupResult.exitCode).toBe(0);

      await syncHostWorkspaceFromSandbox({
        sandbox,
        sandboxWorkDir,
        hostWorkDir,
      });

      expect(existsSync(path.join(hostWorkDir, '.pi'))).toBe(false);
    } finally {
      await sandboxSession.destroy?.();
    }
  });

  it('rejects symlink cycles in just-bash', async () => {
    const sandboxSession = await createJustBashSandbox({
      cwd: sandboxWorkDir,
    }).createSession();
    const sandbox = sandboxSession.restricted();

    try {
      const setupResult = await sandbox.run({
        command: [
          'mkdir -p .agents project-skills',
          'ln -s ../project-skills .agents/skills',
          'ln -s ../.agents/skills project-skills/loop',
        ].join('\n'),
        workingDirectory: sandboxWorkDir,
      });
      expect(setupResult.exitCode).toBe(0);

      await expect(
        syncHostWorkspaceFromSandbox({
          sandbox,
          sandboxWorkDir,
          hostWorkDir,
        }),
      ).rejects.toThrow('symlink cycle');
    } finally {
      await sandboxSession.destroy?.();
    }
  });

  it('enumerates only the scoped paths, never the full workspace', async () => {
    const { sandbox, run } = makeSandbox({ directories: [], files: {} });
    await syncHostWorkspaceFromSandbox({
      sandbox,
      sandboxWorkDir,
      hostWorkDir,
    });

    const command = (run.mock.calls[0]![0] as { command: string }).command;
    expect(command).toContain('.pi');
    expect(command).toContain('.agents');
    expect(command).toContain('AGENTS.md');
    expect(command).not.toContain('CLAUDE.md');
    // Use shell traversal because some sandbox `find` implementations do not
    // support symlink-following flags.
    expect(command).toContain('pi_config_sources');
    expect(command).not.toContain('find -L');
    // The previous full-tree walk used `-mindepth 1`; the scoped walk must not.
    expect(command).not.toContain('-mindepth 1');
  });

  it('leaves out-of-scope local files untouched and never reads them', async () => {
    mkdirSync(path.join(hostWorkDir, 'node_modules', 'pkg'), {
      recursive: true,
    });
    writeFileSync(
      path.join(hostWorkDir, 'node_modules', 'pkg', 'index.js'),
      'module.exports = {};',
    );
    writeFileSync(path.join(hostWorkDir, 'index.ts'), 'export {};');

    const { sandbox, readBinaryFile } = makeSandbox({
      directories: [],
      files: {},
    });
    await syncHostWorkspaceFromSandbox({
      sandbox,
      sandboxWorkDir,
      hostWorkDir,
    });

    expect(
      existsSync(path.join(hostWorkDir, 'node_modules', 'pkg', 'index.js')),
    ).toBe(true);
    expect(existsSync(path.join(hostWorkDir, 'index.ts'))).toBe(true);
    expect(readBinaryFile).not.toHaveBeenCalled();
  });

  it('removes stale .pi files that no longer exist remotely', async () => {
    mkdirSync(path.join(hostWorkDir, '.pi', 'skills', 'old'), {
      recursive: true,
    });
    writeFileSync(
      path.join(hostWorkDir, '.pi', 'skills', 'old', 'SKILL.md'),
      'stale',
    );

    const { sandbox } = makeSandbox({
      directories: ['.pi', '.pi/skills', '.pi/skills/new'],
      files: { '.pi/skills/new/SKILL.md': 'fresh' },
    });
    await syncHostWorkspaceFromSandbox({
      sandbox,
      sandboxWorkDir,
      hostWorkDir,
    });

    expect(
      existsSync(path.join(hostWorkDir, '.pi', 'skills', 'old', 'SKILL.md')),
    ).toBe(false);
    expect(
      readFileSync(
        path.join(hostWorkDir, '.pi', 'skills', 'new', 'SKILL.md'),
        'utf8',
      ),
    ).toBe('fresh');
  });

  it('skips writes when scoped content is already up to date', async () => {
    writeFileSync(path.join(hostWorkDir, 'AGENTS.md'), '# Same');
    const { sandbox } = makeSandbox({
      directories: [],
      files: { 'AGENTS.md': '# Same' },
    });
    await syncHostWorkspaceFromSandbox({
      sandbox,
      sandboxWorkDir,
      hostWorkDir,
    });
    expect(readFileSync(path.join(hostWorkDir, 'AGENTS.md'), 'utf8')).toBe(
      '# Same',
    );
  });
});
