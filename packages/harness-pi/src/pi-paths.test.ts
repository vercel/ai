import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPiPathMapper } from './pi-paths';

let localWorkDir: string;
const remoteWorkDir = '/vfs/pi/test-session/workspace';

beforeEach(() => {
  localWorkDir = mkdtempSync(path.join(tmpdir(), 'pi-paths-'));
});

afterEach(() => {
  rmSync(localWorkDir, { recursive: true, force: true });
});

describe('createPiPathMapper', () => {
  it('translates relative paths to remote POSIX paths', () => {
    const mapper = createPiPathMapper(localWorkDir, remoteWorkDir);
    expect(mapper.toRemotePath('src/foo.ts')).toBe(
      `${remoteWorkDir}/src/foo.ts`,
    );
  });

  it('handles the workspace root itself', () => {
    const mapper = createPiPathMapper(localWorkDir, remoteWorkDir);
    expect(mapper.toRemotePath('.')).toBe(remoteWorkDir);
  });

  it('returns already-remote absolute paths inside the remote root unchanged', () => {
    const mapper = createPiPathMapper(localWorkDir, remoteWorkDir);
    expect(mapper.toRemotePath(`${remoteWorkDir}/already/here.ts`)).toBe(
      `${remoteWorkDir}/already/here.ts`,
    );
  });

  it('throws when a path escapes the workspace', () => {
    const mapper = createPiPathMapper(localWorkDir, remoteWorkDir);
    expect(() => mapper.toRemotePath('../escape.ts')).toThrow(
      /escapes the workspace/,
    );
  });

  it('toRelativePath returns "." for the remote root', () => {
    const mapper = createPiPathMapper(localWorkDir, remoteWorkDir);
    expect(mapper.toRelativePath(remoteWorkDir)).toBe('.');
  });

  it('toRelativePath returns POSIX-relative form for nested paths', () => {
    const mapper = createPiPathMapper(localWorkDir, remoteWorkDir);
    expect(mapper.toRelativePath(`${remoteWorkDir}/a/b/c.ts`)).toBe('a/b/c.ts');
  });
});
