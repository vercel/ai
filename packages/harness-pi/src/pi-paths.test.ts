import { describe, expect, it } from 'vitest';
import { createPiPathMapper } from './pi-paths';

const sandboxWorkDir = '/sandbox/work/session';

describe('createPiPathMapper', () => {
  it('translates relative paths to sandbox POSIX paths', () => {
    const mapper = createPiPathMapper({ sandboxWorkDir });
    expect(mapper.toSandboxPath('src/foo.ts')).toBe(
      `${sandboxWorkDir}/src/foo.ts`,
    );
  });

  it('handles the workspace root itself', () => {
    const mapper = createPiPathMapper({ sandboxWorkDir });
    expect(mapper.toSandboxPath('.')).toBe(sandboxWorkDir);
  });

  it('returns already-sandbox absolute paths inside the sandbox root unchanged', () => {
    const mapper = createPiPathMapper({ sandboxWorkDir });
    expect(mapper.toSandboxPath(`${sandboxWorkDir}/already/here.ts`)).toBe(
      `${sandboxWorkDir}/already/here.ts`,
    );
  });

  it('throws when a path escapes the workspace', () => {
    const mapper = createPiPathMapper({ sandboxWorkDir });
    expect(() => mapper.toSandboxPath('../escape.ts')).toThrow(
      /escapes the workspace/,
    );
  });

  it('accepts two-dot-prefixed names inside the workspace', () => {
    const mapper = createPiPathMapper({ sandboxWorkDir });
    expect(mapper.toSandboxPath('..notes/file.txt')).toBe(
      `${sandboxWorkDir}/..notes/file.txt`,
    );
    expect(mapper.assertSandboxPath(`${sandboxWorkDir}/..notes/file.txt`)).toBe(
      `${sandboxWorkDir}/..notes/file.txt`,
    );
    expect(() => mapper.assertSandboxPath('/sandbox/work/escape.txt')).toThrow(
      /escapes the workspace/,
    );
  });

  it('allows configured read-only sandbox roots for readable paths', () => {
    const mapper = createPiPathMapper({
      sandboxWorkDir,
      readableRoots: [{ sandboxDir: '/home/vercel-sandbox/.agents/skills' }],
    });
    expect(
      mapper.toReadableSandboxPath(
        '/home/vercel-sandbox/.agents/skills/weather-codes/SKILL.md',
      ),
    ).toBe('/home/vercel-sandbox/.agents/skills/weather-codes/SKILL.md');
    expect(() =>
      mapper.toSandboxPath(
        '/home/vercel-sandbox/.agents/skills/weather-codes/SKILL.md',
      ),
    ).toThrow(/escapes the workspace/);
  });

  it('refuses readable paths inside a denied root', () => {
    const mapper = createPiPathMapper({
      sandboxWorkDir,
      readableRoots: [{ sandboxDir: '/home/vercel-sandbox' }],
      deniedRoots: ['/home/vercel-sandbox/.credentials'],
    });

    expect(() =>
      mapper.toReadableSandboxPath('/home/vercel-sandbox/.credentials/token'),
    ).toThrow(/inside a denied root/);
    expect(() =>
      mapper.assertReadableSandboxPath('/home/vercel-sandbox/.credentials'),
    ).toThrow(/inside a denied root/);
    expect(
      mapper.toReadableSandboxPath('/home/vercel-sandbox/.credentials-old/a'),
    ).toBe('/home/vercel-sandbox/.credentials-old/a');
  });

  it('refuses workspace paths inside a denied root', () => {
    const mapper = createPiPathMapper({
      sandboxWorkDir,
      deniedRoots: [`${sandboxWorkDir}/.private`],
    });

    expect(() => mapper.toReadableSandboxPath('.private/journal')).toThrow(
      /inside a denied root/,
    );
    expect(() => mapper.toSandboxPath('.private/journal')).toThrow(
      /inside a denied root/,
    );
    expect(() =>
      mapper.assertSandboxPath(`${sandboxWorkDir}/.private/journal`),
    ).toThrow(/inside a denied root/);
    expect(mapper.toSandboxPath('src/foo.ts')).toBe(
      `${sandboxWorkDir}/src/foo.ts`,
    );
  });

  it('denies two-dot-prefixed descendants and includes two-dot-prefixed denied roots in recursive exclusions', () => {
    const mapper = createPiPathMapper({
      sandboxWorkDir,
      deniedRoots: [`${sandboxWorkDir}/private`, `${sandboxWorkDir}/..private`],
    });

    expect(() =>
      mapper.toReadableSandboxPath('private/..backup/token.txt'),
    ).toThrow(/inside a denied root/);
    expect(() =>
      mapper.toReadableSandboxPath(`${sandboxWorkDir}/..private/token.txt`),
    ).toThrow(/inside a denied root/);
    expect(mapper.relativeDeniedRootsUnder(sandboxWorkDir)).toEqual([
      'private',
      '..private',
    ]);
    expect(
      mapper.toReadableSandboxPath('private-copy/..backup/token.txt'),
    ).toBe(`${sandboxWorkDir}/private-copy/..backup/token.txt`);
  });

  it('expands ~ against the configured home directory', () => {
    const mapper = createPiPathMapper({
      sandboxWorkDir,
      homeDir: '/home/vercel-sandbox',
      readableRoots: [{ sandboxDir: '/home/vercel-sandbox' }],
    });

    expect(mapper.toReadableSandboxPath('~/notes.txt')).toBe(
      '/home/vercel-sandbox/notes.txt',
    );
    expect(mapper.toReadableSandboxPath('~')).toBe('/home/vercel-sandbox');
    expect(() => mapper.toSandboxPath('~/notes.txt')).toThrow(
      /escapes the workspace/,
    );
  });

  it('treats ~ as a workspace-relative name without a home directory', () => {
    const mapper = createPiPathMapper({ sandboxWorkDir });
    expect(mapper.toReadableSandboxPath('~/notes.txt')).toBe(
      `${sandboxWorkDir}/~/notes.txt`,
    );
  });

  it('toRelativePath returns "." for the sandbox root', () => {
    const mapper = createPiPathMapper({ sandboxWorkDir });
    expect(mapper.toRelativePath(sandboxWorkDir)).toBe('.');
  });

  it('toRelativePath returns POSIX-relative form for nested paths', () => {
    const mapper = createPiPathMapper({ sandboxWorkDir });
    expect(mapper.toRelativePath(`${sandboxWorkDir}/a/b/c.ts`)).toBe(
      'a/b/c.ts',
    );
  });
});
