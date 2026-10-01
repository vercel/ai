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
import { gzipSync } from 'node:zlib';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARCHIVE_BATCH_SIZE,
  syncHostWorkspaceFromSandbox,
} from './pi-workspace-mirror';

const sandboxWorkDir = '/sandbox/work';

/** Minimal ustar writer: one regular-file member per entry. */
function makeTarArchive(entries: Array<[string, string]>): Buffer {
  const blocks: Buffer[] = [];

  for (const [member, content] of entries) {
    const header = Buffer.alloc(512);
    const splitAt = member.length > 100 ? member.lastIndexOf('/', 100) : -1;
    const name = splitAt === -1 ? member : member.slice(splitAt + 1);
    const prefix = splitAt === -1 ? '' : member.slice(0, splitAt);
    const body = Buffer.from(content, 'utf8');

    header.write(name, 0, 100, 'utf8');
    header.write('000644 \0', 100, 8, 'utf8');
    header.write(`${body.length.toString(8).padStart(11, '0')} `, 124, 12);
    header.write('0', 156, 1, 'utf8');
    header.write('ustar\0', 257, 6, 'utf8');
    header.write('00', 263, 2, 'utf8');
    header.write(prefix, 345, 155, 'utf8');
    header.fill(' ', 148, 156);
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');

    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }

  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function makeSandbox(
  remoteListing: {
    directories: string[];
    files: Record<string, string>;
  },
  options?: {
    rejectFindSymlinkFlags?: boolean;
    withoutTar?: boolean;
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

  // Mirror the sandbox-side archive: gzipped tar of the requested members,
  // base64-encoded on stdout.
  function archiveOutput(command: string): string {
    const members = [...command.matchAll(/'([^']*)'/g)]
      .map(match => (match[1] as string).split("'\\''").join("'"))
      .filter(member => member.startsWith(sandboxWorkDir.slice(1)));
    const entries = members.flatMap<[string, string]>(member => {
      const relative = path.posix.relative(
        sandboxWorkDir.slice(1),
        member,
      ) as string;
      const content = remoteListing.files[relative];
      return content == null ? [] : [[member, content]];
    });
    return gzipSync(makeTarArchive(entries)).toString('base64');
  }

  const run = vi.fn(async ({ command }: { command: string }) => {
    if (command.startsWith('tar ')) {
      return options?.withoutTar
        ? { exitCode: 127, stdout: '', stderr: 'tar: not found\n' }
        : { exitCode: 0, stdout: archiveOutput(command), stderr: '' };
    }
    return options?.rejectFindSymlinkFlags && command.includes('find -L')
      ? {
          exitCode: 0,
          stdout: '',
          stderr: "find: unknown predicate '-L'\n",
        }
      : {
          exitCode: 0,
          stdout: listOutput,
          stderr: '',
        };
  });
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
      await sandboxSession.destroy();
    }
  }, 30_000);

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
      await sandboxSession.destroy();
    }
  }, 60_000);

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
      await sandboxSession.destroy();
    }
  });

  it('mirrors config when the sandbox work directory has a symlinked ancestor in just-bash', async () => {
    const sandboxRoot = '/sandbox';
    const linkedWorkDir = '/sandbox/workspace-link/project';
    const sandboxSession = await createJustBashSandbox({
      cwd: sandboxRoot,
    }).createSession();
    const sandbox = sandboxSession.restricted();

    try {
      const setupResult = await sandbox.run({
        command: [
          'mkdir -p workspace/project/.pi/skills/demo',
          `printf '# Project prompt' > workspace/project/.pi/SYSTEM.md`,
          `printf '# Project skill' > workspace/project/.pi/skills/demo/SKILL.md`,
          'ln -s workspace workspace-link',
        ].join('\n'),
        workingDirectory: sandboxRoot,
      });
      expect(setupResult.exitCode).toBe(0);

      await syncHostWorkspaceFromSandbox({
        sandbox,
        sandboxWorkDir: linkedWorkDir,
        hostWorkDir,
      });

      expect(
        readFileSync(path.join(hostWorkDir, '.pi/SYSTEM.md'), 'utf8'),
      ).toBe('# Project prompt');
      expect(
        readFileSync(
          path.join(hostWorkDir, '.pi/skills/demo/SKILL.md'),
          'utf8',
        ),
      ).toBe('# Project skill');
    } finally {
      await sandboxSession.destroy();
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
      await sandboxSession.destroy();
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
      await sandboxSession.destroy();
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

  it('transfers files as batched archives instead of one request per file', async () => {
    // One file past the 300-file batch boundary — enough to prove a second
    // archive request happens and that the last file isn't dropped at the
    // split, without paying for hundreds of unnecessary tar entries.
    const fileCount = ARCHIVE_BATCH_SIZE + 1;
    const files: Record<string, string> = {};
    for (let index = 0; index < fileCount; index++) {
      files[`.agents/skills/skill-${index}/SKILL.md`] = `# skill ${index}`;
    }
    const { sandbox, run, readBinaryFile } = makeSandbox({
      directories: ['.agents', '.agents/skills'],
      files,
    });

    await syncHostWorkspaceFromSandbox({
      sandbox,
      sandboxWorkDir,
      hostWorkDir,
    });

    expect(readBinaryFile).not.toHaveBeenCalled();
    // One listing plus ceil(fileCount / 300) archives — not fileCount requests.
    expect(run).toHaveBeenCalledTimes(3);
    expect(
      readFileSync(
        path.join(
          hostWorkDir,
          `.agents/skills/skill-${fileCount - 1}/SKILL.md`,
        ),
        'utf8',
      ),
    ).toBe(`# skill ${fileCount - 1}`);
  });

  it('mirrors members whose path exceeds the 100-character tar name field', async () => {
    const longName =
      'a-skill-directory-name-long-enough-to-need-the-ustar-prefix-field';
    const relativePath = `.agents/skills/${longName}/${longName}/SKILL.md`;
    const { sandbox, readBinaryFile } = makeSandbox({
      directories: ['.agents', '.agents/skills'],
      files: { [relativePath]: '# Long path skill' },
    });

    await syncHostWorkspaceFromSandbox({
      sandbox,
      sandboxWorkDir,
      hostWorkDir,
    });

    expect(readBinaryFile).not.toHaveBeenCalled();
    expect(readFileSync(path.join(hostWorkDir, relativePath), 'utf8')).toBe(
      '# Long path skill',
    );
  });

  it('falls back to per-file reads when the sandbox cannot archive', async () => {
    const { sandbox, readBinaryFile } = makeSandbox(
      {
        directories: ['.pi'],
        files: { '.pi/SYSTEM.md': '# Prompt' },
      },
      { withoutTar: true },
    );

    await syncHostWorkspaceFromSandbox({
      sandbox,
      sandboxWorkDir,
      hostWorkDir,
    });

    expect(readBinaryFile).toHaveBeenCalledTimes(1);
    expect(readFileSync(path.join(hostWorkDir, '.pi/SYSTEM.md'), 'utf8')).toBe(
      '# Prompt',
    );
  });

  it('throws when a file disappears and neither transfer path can read it', async () => {
    const { sandbox } = makeSandbox(
      { directories: [], files: { 'AGENTS.md': '# Gone' } },
      { withoutTar: true },
    );
    (
      sandbox.readBinaryFile as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    await expect(
      syncHostWorkspaceFromSandbox({ sandbox, sandboxWorkDir, hostWorkDir }),
    ).rejects.toThrow('disappeared during mirror sync');
  });

  it('transfers a real skills tree as one archive in just-bash', async () => {
    const sandboxSession = await createJustBashSandbox({
      cwd: sandboxWorkDir,
      // The scoped traversal spends a handful of shell commands per entry, and
      // just-bash caps a single `run` at 10k commands by default; a real shell
      // has no such cap. Raise it so this test measures the transfer, not the
      // interpreter's budget.
      maxCommandCount: 500_000,
    }).createSession();
    const restricted = sandboxSession.restricted();
    const readBinaryFile = vi.fn(
      restricted.readBinaryFile.bind(restricted) as (args: {
        path: string;
      }) => Promise<Uint8Array | null>,
    );
    const run = vi.fn(restricted.run.bind(restricted));
    const sandbox = {
      ...restricted,
      run,
      readBinaryFile,
    } as unknown as Experimental_SandboxSession;

    try {
      const setupResult = await restricted.run({
        command: [
          'i=0',
          'while [ "$i" -lt 250 ]; do',
          '  mkdir -p ".agents/skills/skill-$i"',
          `  printf '# skill %s' "$i" > ".agents/skills/skill-$i/SKILL.md"`,
          '  i=$((i + 1))',
          'done',
          'true',
        ].join('\n'),
        workingDirectory: sandboxWorkDir,
      });
      expect(setupResult.exitCode).toBe(0);

      await syncHostWorkspaceFromSandbox({
        sandbox,
        sandboxWorkDir,
        hostWorkDir,
      });

      // Listing plus a single archive for all 250 files, no per-file reads.
      expect(run).toHaveBeenCalledTimes(2);
      expect(readBinaryFile).not.toHaveBeenCalled();
      expect(
        readFileSync(
          path.join(hostWorkDir, '.agents/skills/skill-249/SKILL.md'),
          'utf8',
        ),
      ).toBe('# skill 249');
    } finally {
      await sandboxSession.destroy();
    }
  }, 60_000);
});
