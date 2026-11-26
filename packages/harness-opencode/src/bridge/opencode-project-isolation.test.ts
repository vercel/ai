import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveOpenCodeInstructions } from './opencode-project-isolation';

const tempDirectories: string[] = [];

function createTempDirectory(): string {
  const directory = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'opencode-project-isolation-')),
  );
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('resolveOpenCodeInstructions', () => {
  it('resolves a symlinked working directory', () => {
    const root = createTempDirectory();
    const target = path.join(root, 'target');
    const link = path.join(root, 'link');
    mkdirSync(target);
    symlinkSync(target, link);

    expect(
      resolveOpenCodeInstructions({
        workdir: link,
        hostInstructions: undefined,
      }),
    ).toEqual([path.join(target, 'AGENTS.md')]);
  });

  it('always includes the working directory AGENTS.md', () => {
    expect(
      resolveOpenCodeInstructions({
        workdir: '/work/repo',
        hostInstructions: undefined,
      }),
    ).toEqual(['/work/repo/AGENTS.md']);
  });

  it('resolves relative host entries against the working directory', () => {
    expect(
      resolveOpenCodeInstructions({
        workdir: '/work/repo',
        hostInstructions: [
          'docs/rules.md',
          'https://example.com/a.md',
          'http://example.com/b.md',
          '~/a.md',
          '/etc/b.md',
        ],
      }),
    ).toEqual([
      '/work/repo/AGENTS.md',
      '/work/repo/docs/rules.md',
      'https://example.com/a.md',
      'http://example.com/b.md',
      '~/a.md',
      '/etc/b.md',
    ]);
  });

  it('expands host entries with glob characters in a directory segment', () => {
    const workdir = createTempDirectory();
    mkdirSync(path.join(workdir, 'docs', 'a', 'b'), { recursive: true });
    mkdirSync(path.join(workdir, 'docs', 'folder.md'));
    writeFileSync(path.join(workdir, 'docs', 'top.md'), 'top');
    writeFileSync(path.join(workdir, 'docs', 'a', 'b', 'rules.md'), 'rules');
    writeFileSync(path.join(workdir, 'docs', 'a', 'notes.txt'), 'notes');

    expect(
      resolveOpenCodeInstructions({
        workdir,
        hostInstructions: ['docs/**/*.md', 'missing/**/*.md'],
      }),
    ).toEqual([
      path.join(workdir, 'AGENTS.md'),
      path.join(workdir, 'docs', 'a', 'b', 'rules.md'),
      path.join(workdir, 'docs', 'top.md'),
    ]);
  });

  it('keeps host entries with glob characters only in the file name as one absolute entry', () => {
    expect(
      resolveOpenCodeInstructions({
        workdir: '/work/repo',
        hostInstructions: ['docs/*.md', '*.md'],
      }),
    ).toEqual([
      '/work/repo/AGENTS.md',
      '/work/repo/docs/*.md',
      '/work/repo/*.md',
    ]);
  });

  it.each([['not-an-array'], [['valid.md', 1]]])(
    'leaves invalid host instructions untouched (%j)',
    hostInstructions => {
      expect(
        resolveOpenCodeInstructions({
          workdir: '/work/repo',
          hostInstructions,
        }),
      ).toBeUndefined();
    },
  );
});

describe('resolveOpenCodeInstructions with a mirror directory', () => {
  function setUp() {
    const root = createTempDirectory();
    const workdir = path.join(root, 'repo');
    const outside = path.join(root, 'outside');
    const mirrorDir = path.join(root, 'state', 'instructions');
    mkdirSync(path.join(workdir, 'docs'), { recursive: true });
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'marker.txt'), 'OUTSIDE_MARKER');
    writeFileSync(path.join(outside, 'secret.md'), 'OUTSIDE_MARKER');
    return { workdir, outside, mirrorDir };
  }

  function mirrorText(mirrorDir: string): string {
    if (!existsSync(mirrorDir)) return '';
    return readdirSync(mirrorDir, { recursive: true })
      .map(name => path.join(mirrorDir, String(name)))
      .filter(file => statSync(file).isFile())
      .map(file => readFileSync(file, 'utf8'))
      .join('\n');
  }

  it('mirrors a regular AGENTS.md and configures only the mirror', () => {
    const { workdir, mirrorDir } = setUp();
    writeFileSync(path.join(workdir, 'AGENTS.md'), 'repo rules');

    expect(
      resolveOpenCodeInstructions({
        workdir,
        hostInstructions: undefined,
        mirrorDir,
      }),
    ).toEqual([path.join(mirrorDir, 'AGENTS.md')]);
    expect(readFileSync(path.join(mirrorDir, 'AGENTS.md'), 'utf8')).toBe(
      'repo rules',
    );
  });

  it('returns the mirror path without a file when the repository has no AGENTS.md', () => {
    const { workdir, mirrorDir } = setUp();

    expect(
      resolveOpenCodeInstructions({
        workdir,
        hostInstructions: undefined,
        mirrorDir,
      }),
    ).toEqual([path.join(mirrorDir, 'AGENTS.md')]);
    expect(existsSync(path.join(mirrorDir, 'AGENTS.md'))).toBe(false);
  });

  it('mirrors an AGENTS.md symlink that stays inside the working directory', () => {
    const { workdir, mirrorDir } = setUp();
    writeFileSync(path.join(workdir, 'docs', 'internal.md'), 'INTERNAL_RULES');
    symlinkSync('docs/internal.md', path.join(workdir, 'AGENTS.md'));

    resolveOpenCodeInstructions({
      workdir,
      hostInstructions: undefined,
      mirrorDir,
    });

    expect(readFileSync(path.join(mirrorDir, 'AGENTS.md'), 'utf8')).toBe(
      'INTERNAL_RULES',
    );
  });

  it.each([
    'relative',
    'absolute',
    'symlinked ancestor',
    'dangling',
    'loop',
    'directory',
  ])(
    'does not mirror an AGENTS.md that resolves outside the working directory (%s)',
    kind => {
      const { workdir, outside, mirrorDir } = setUp();
      const agents = path.join(workdir, 'AGENTS.md');
      if (kind === 'relative') {
        symlinkSync('../outside/marker.txt', agents);
      } else if (kind === 'absolute') {
        symlinkSync(path.join(outside, 'marker.txt'), agents);
      } else if (kind === 'symlinked ancestor') {
        symlinkSync(outside, path.join(workdir, 'linked'));
        symlinkSync('linked/marker.txt', agents);
      } else if (kind === 'dangling') {
        symlinkSync('../missing.md', agents);
      } else if (kind === 'loop') {
        symlinkSync('AGENTS.md', agents);
      } else {
        mkdirSync(agents);
      }

      expect(
        resolveOpenCodeInstructions({
          workdir,
          hostInstructions: undefined,
          mirrorDir,
        }),
      ).toEqual([path.join(mirrorDir, 'AGENTS.md')]);
      expect(existsSync(path.join(mirrorDir, 'AGENTS.md'))).toBe(false);
      expect(mirrorText(mirrorDir)).not.toContain('OUTSIDE_MARKER');
    },
  );

  it('drops a previously mirrored AGENTS.md once it is replaced by an outside symlink', () => {
    const { workdir, outside, mirrorDir } = setUp();
    const agents = path.join(workdir, 'AGENTS.md');
    writeFileSync(agents, 'SAFE_RULES');
    resolveOpenCodeInstructions({
      workdir,
      hostInstructions: undefined,
      mirrorDir,
    });
    unlinkSync(agents);
    symlinkSync(path.join(outside, 'marker.txt'), agents);

    expect(
      resolveOpenCodeInstructions({
        workdir,
        hostInstructions: undefined,
        mirrorDir,
      }),
    ).toEqual([path.join(mirrorDir, 'AGENTS.md')]);
    expect(existsSync(path.join(mirrorDir, 'AGENTS.md'))).toBe(false);
    expect(mirrorText(mirrorDir)).not.toContain('OUTSIDE_MARKER');
  });

  it('refreshes the mirror with the latest in-workdir AGENTS.md', () => {
    const { workdir, mirrorDir } = setUp();
    const agents = path.join(workdir, 'AGENTS.md');
    writeFileSync(agents, 'RULES_V1');
    resolveOpenCodeInstructions({
      workdir,
      hostInstructions: undefined,
      mirrorDir,
    });
    writeFileSync(agents, 'RULES_V2');
    resolveOpenCodeInstructions({
      workdir,
      hostInstructions: undefined,
      mirrorDir,
    });

    expect(readFileSync(path.join(mirrorDir, 'AGENTS.md'), 'utf8')).toBe(
      'RULES_V2',
    );
  });

  it('mirrors relative host entries and rejects those that resolve outside', () => {
    const { workdir, outside, mirrorDir } = setUp();
    writeFileSync(path.join(workdir, 'docs', 'rules.md'), 'HOST_RULES');
    symlinkSync(
      path.join(outside, 'marker.txt'),
      path.join(workdir, 'docs', 'escape.md'),
    );
    symlinkSync(outside, path.join(workdir, 'linked'));

    const instructions = resolveOpenCodeInstructions({
      workdir,
      hostInstructions: [
        'docs/rules.md',
        'docs/escape.md',
        'linked/marker.txt',
        '../outside/marker.txt',
        'docs/missing.md',
      ],
      mirrorDir,
    });

    expect(instructions).toEqual([
      path.join(mirrorDir, 'AGENTS.md'),
      path.join(mirrorDir, 'host-0', 'rules.md'),
      path.join(mirrorDir, 'host-1', 'escape.md'),
      path.join(mirrorDir, 'host-2', 'marker.txt'),
      path.join(mirrorDir, 'host-3', 'marker.txt'),
      path.join(mirrorDir, 'host-4', 'missing.md'),
    ]);
    expect(
      readFileSync(path.join(mirrorDir, 'host-0', 'rules.md'), 'utf8'),
    ).toBe('HOST_RULES');
    expect(mirrorText(mirrorDir)).not.toContain('OUTSIDE_MARKER');
  });

  it('mirrors glob host entries and skips outside symlinks found while expanding', () => {
    const { workdir, outside, mirrorDir } = setUp();
    mkdirSync(path.join(workdir, 'docs', 'nested'));
    writeFileSync(path.join(workdir, 'docs', 'top.md'), 'TOP_RULES');
    writeFileSync(
      path.join(workdir, 'docs', 'nested', 'deep.md'),
      'DEEP_RULES',
    );
    symlinkSync(
      path.join(outside, 'secret.md'),
      path.join(workdir, 'docs', 'file-link.md'),
    );
    symlinkSync(outside, path.join(workdir, 'docs', 'dir-link'));

    const instructions = resolveOpenCodeInstructions({
      workdir,
      hostInstructions: ['docs/**/*.md'],
      mirrorDir,
    });

    expect(instructions).toEqual([
      path.join(mirrorDir, 'AGENTS.md'),
      path.join(mirrorDir, 'host-0', '*'),
    ]);
    expect(readdirSync(path.join(mirrorDir, 'host-0')).sort()).toEqual([
      '0000-deep.md',
      '0001-top.md',
    ]);
    expect(mirrorText(mirrorDir)).toContain('DEEP_RULES');
    expect(mirrorText(mirrorDir)).not.toContain('OUTSIDE_MARKER');
  });

  it('removes mirrors of host entries that are no longer configured', () => {
    const { workdir, mirrorDir } = setUp();
    writeFileSync(path.join(workdir, 'docs', 'rules.md'), 'HOST_RULES');
    resolveOpenCodeInstructions({
      workdir,
      hostInstructions: ['docs/rules.md'],
      mirrorDir,
    });
    resolveOpenCodeInstructions({
      workdir,
      hostInstructions: [],
      mirrorDir,
    });

    expect(existsSync(path.join(mirrorDir, 'host-0'))).toBe(false);
  });

  it('passes explicit absolute, home, and URL host entries through unchanged', () => {
    const { workdir, mirrorDir } = setUp();
    const hostInstructions = [
      '/etc/rules.md',
      '~/rules.md',
      'https://example.com/rules.md',
    ];

    expect(
      resolveOpenCodeInstructions({ workdir, hostInstructions, mirrorDir }),
    ).toEqual([path.join(mirrorDir, 'AGENTS.md'), ...hostInstructions]);
  });

  it('leaves invalid host instructions untouched', () => {
    const { workdir, mirrorDir } = setUp();

    expect(
      resolveOpenCodeInstructions({
        workdir,
        hostInstructions: 'not-an-array',
        mirrorDir,
      }),
    ).toBeUndefined();
  });
});
