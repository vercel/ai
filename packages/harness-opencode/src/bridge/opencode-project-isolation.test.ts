import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
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
