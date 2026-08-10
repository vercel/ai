import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPiPathMapper, type PiFileToolPathPolicy } from './pi-paths';

let hostWorkDir: string;
const sandboxWorkDir = '/sandbox/work/session';

beforeEach(() => {
  hostWorkDir = mkdtempSync(path.join(tmpdir(), 'pi-paths-'));
});

afterEach(() => {
  rmSync(hostWorkDir, { recursive: true, force: true });
});

function createPolicyMapper(fileToolPathPolicy: PiFileToolPathPolicy) {
  return createPiPathMapper({
    hostWorkDir,
    sandboxWorkDir,
    fileToolPathPolicy,
  });
}

describe('createPiPathMapper', () => {
  it('translates relative paths to sandbox POSIX paths', () => {
    const mapper = createPiPathMapper({ hostWorkDir, sandboxWorkDir });
    expect(mapper.toSandboxPath('src/foo.ts')).toBe(
      `${sandboxWorkDir}/src/foo.ts`,
    );
  });

  it('handles the workspace root itself', () => {
    const mapper = createPiPathMapper({ hostWorkDir, sandboxWorkDir });
    expect(mapper.toSandboxPath('.')).toBe(sandboxWorkDir);
  });

  it('returns already-sandbox absolute paths inside the sandbox root unchanged', () => {
    const mapper = createPiPathMapper({ hostWorkDir, sandboxWorkDir });
    expect(mapper.toSandboxPath(`${sandboxWorkDir}/already/here.ts`)).toBe(
      `${sandboxWorkDir}/already/here.ts`,
    );
  });

  it('throws when a path escapes the workspace', () => {
    const mapper = createPiPathMapper({ hostWorkDir, sandboxWorkDir });
    expect(() => mapper.toSandboxPath('../escape.ts')).toThrow(
      /escapes the workspace/,
    );
  });

  it('allows configured read-only sandbox roots for readable paths', () => {
    const mapper = createPiPathMapper({
      hostWorkDir,
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

  it('allows additional read-only roots without making them writable', () => {
    const mapper = createPolicyMapper({
      readableRoots: ['/mnt/reference/../reference'],
    });
    const referencePath = '/mnt/reference/catalog.json';

    expect(mapper.toReadableSandboxPath(referencePath)).toBe(referencePath);
    expect(mapper.assertReadableSandboxPath(referencePath)).toBe(referencePath);
    expect(() => mapper.toSandboxPath(referencePath)).toThrow(
      /escapes the workspace/,
    );
    expect(() => mapper.assertSandboxPath(referencePath)).toThrow(
      /escapes the workspace/,
    );
  });

  it('makes writable roots readable and keeps path-prefix boundaries', () => {
    const mapper = createPolicyMapper({ writableRoots: ['/tmp/'] });

    expect(mapper.toSandboxPath('/tmp/output.json')).toBe('/tmp/output.json');
    expect(mapper.toReadableSandboxPath('/tmp/output.json')).toBe(
      '/tmp/output.json',
    );
    expect(mapper.assertSandboxPath('/tmp/output.json')).toBe(
      '/tmp/output.json',
    );
    expect(() => mapper.toSandboxPath('/tmp-evil/output.json')).toThrow(
      /escapes the workspace/,
    );
    expect(() => mapper.toReadableSandboxPath('/tmp-evil/output.json')).toThrow(
      /escapes the readable roots/,
    );
  });

  it('requires every public policy root to be an absolute sandbox path', () => {
    expect(() => createPolicyMapper({ readableRoots: ['reference'] })).toThrow(
      'Pi readable root must be an absolute sandbox path: reference',
    );
    expect(() => createPolicyMapper({ writableRoots: ['scratch'] })).toThrow(
      'Pi writable root must be an absolute sandbox path: scratch',
    );
    expect(() => createPolicyMapper({ deniedRoots: ['private'] })).toThrow(
      'Pi denied root must be an absolute sandbox path: private',
    );
  });

  it('gives denied roots precedence over every readable and writable root', () => {
    const skillRoot = '/home/vercel-sandbox/.agents/skills';
    const mapper = createPiPathMapper({
      hostWorkDir,
      sandboxWorkDir,
      readableRoots: [{ sandboxDir: skillRoot }],
      fileToolPathPolicy: {
        readableRoots: ['/mnt/reference'],
        writableRoots: ['/tmp'],
        deniedRoots: [
          `${sandboxWorkDir}/private`,
          `${skillRoot}/private`,
          '/mnt/reference/private',
          '/tmp/private',
        ],
      },
    });

    expect(() => mapper.toSandboxPath('private/token')).toThrow(
      /denied by the file-tool policy/,
    );
    expect(() =>
      mapper.toReadableSandboxPath(`${skillRoot}/private/SKILL.md`),
    ).toThrow(/denied by the file-tool policy/);
    expect(() =>
      mapper.toReadableSandboxPath('/mnt/reference/private/data.json'),
    ).toThrow(/denied by the file-tool policy/);
    expect(() => mapper.toSandboxPath('/tmp/private/result.json')).toThrow(
      /denied by the file-tool policy/,
    );

    expect(mapper.toSandboxPath(`${sandboxWorkDir}/public.txt`)).toBe(
      `${sandboxWorkDir}/public.txt`,
    );
    expect(mapper.toReadableSandboxPath(`${skillRoot}/public/SKILL.md`)).toBe(
      `${skillRoot}/public/SKILL.md`,
    );
    expect(mapper.toReadableSandboxPath('/mnt/reference/public.json')).toBe(
      '/mnt/reference/public.json',
    );
    expect(mapper.toSandboxPath('/tmp/public.json')).toBe('/tmp/public.json');
  });

  it('maps absolute host mirror paths before matching writable sandbox roots', () => {
    const mapper = createPolicyMapper({
      writableRoots: [path.posix.dirname(hostWorkDir)],
    });
    const hostFilePath = path.join(hostWorkDir, 'result.json');

    expect(mapper.toSandboxPath(hostFilePath)).toBe(
      `${sandboxWorkDir}/result.json`,
    );
    expect(mapper.toReadableSandboxPath(hostFilePath)).toBe(
      `${sandboxWorkDir}/result.json`,
    );
  });

  it('does not reinterpret a host mirror symlink escape as an allowed sandbox path', () => {
    const hostLink = path.join(hostWorkDir, 'outside-link');
    symlinkSync(tmpdir(), hostLink, 'dir');
    const mapper = createPolicyMapper({
      writableRoots: [path.posix.normalize(tmpdir())],
    });

    expect(() =>
      mapper.toSandboxPath(path.join(hostLink, 'secret.txt')),
    ).toThrow(/escapes the workspace/);
    expect(() =>
      mapper.toReadableSandboxPath(path.join(hostLink, 'secret.txt')),
    ).toThrow(/escapes the workspace/);
  });

  it('reports workspace membership with normalized boundary-safe checks', () => {
    const mapper = createPolicyMapper({ writableRoots: ['/tmp'] });

    expect(mapper.isWorkspacePath(sandboxWorkDir)).toBe(true);
    expect(
      mapper.isWorkspacePath(`${sandboxWorkDir}/src/../package.json`),
    ).toBe(true);
    expect(mapper.isWorkspacePath(`${sandboxWorkDir}-other/file.txt`)).toBe(
      false,
    );
    expect(mapper.isWorkspacePath('/tmp/output.json')).toBe(false);
  });

  it('returns normalized denied descendants within a recursive root', () => {
    const mapper = createPolicyMapper({
      deniedRoots: [
        `${sandboxWorkDir}/private`,
        `${sandboxWorkDir}/nested/../credentials`,
        '/tmp/private',
        '/tmp-other/not-a-descendant',
      ],
    });

    expect(mapper.getDeniedSandboxRootsWithin(sandboxWorkDir)).toEqual([
      `${sandboxWorkDir}/private`,
      `${sandboxWorkDir}/credentials`,
    ]);
    expect(mapper.getDeniedSandboxRootsWithin('/tmp')).toEqual([
      '/tmp/private',
    ]);
    expect(mapper.getDeniedSandboxRootsWithin('/tmp/private')).toEqual([
      '/tmp/private',
    ]);
  });

  it('toRelativePath returns "." for the sandbox root', () => {
    const mapper = createPiPathMapper({ hostWorkDir, sandboxWorkDir });
    expect(mapper.toRelativePath(sandboxWorkDir)).toBe('.');
  });

  it('toRelativePath returns POSIX-relative form for nested paths', () => {
    const mapper = createPiPathMapper({ hostWorkDir, sandboxWorkDir });
    expect(mapper.toRelativePath(`${sandboxWorkDir}/a/b/c.ts`)).toBe(
      'a/b/c.ts',
    );
  });
});
