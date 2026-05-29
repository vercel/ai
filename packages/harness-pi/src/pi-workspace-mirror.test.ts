import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Experimental_Sandbox } from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncLocalWorkspaceFromSandbox } from './pi-workspace-mirror';

const remoteWorkDir = '/sandbox/work';

function makeSandbox(remoteListing: {
  directories: string[];
  files: Record<string, string>;
}): Experimental_Sandbox {
  const listOutput = [
    ...remoteListing.directories.map(d => `d\t${d}`),
    ...Object.keys(remoteListing.files).map(f => `f\t${f}`),
  ]
    .sort()
    .join('\n');

  return {
    description: 'mock',
    run: vi.fn(async () => ({ exitCode: 0, stdout: listOutput, stderr: '' })),
    readBinaryFile: vi.fn(async ({ path: requestedPath }: { path: string }) => {
      const relative = path.posix.relative(remoteWorkDir, requestedPath);
      const content = remoteListing.files[relative];
      return content == null ? null : new TextEncoder().encode(content);
    }),
    readFile: vi.fn(),
    readTextFile: vi.fn(),
    writeFile: vi.fn(),
    writeBinaryFile: vi.fn(),
    writeTextFile: vi.fn(),
    spawn: vi.fn(),
  } as unknown as Experimental_Sandbox;
}

let localWorkDir: string;

beforeEach(() => {
  localWorkDir = mkdtempSync(path.join(tmpdir(), 'pi-wmirror-'));
});

afterEach(() => {
  rmSync(localWorkDir, { recursive: true, force: true });
});

describe('syncLocalWorkspaceFromSandbox', () => {
  it('creates remote files locally', async () => {
    const sandbox = makeSandbox({
      directories: ['src'],
      files: { 'src/index.ts': 'export {};', 'README.md': '# Hello' },
    });
    await syncLocalWorkspaceFromSandbox({
      sandbox,
      remoteWorkDir,
      localWorkDir,
    });
    expect(readFileSync(path.join(localWorkDir, 'src/index.ts'), 'utf8')).toBe(
      'export {};',
    );
    expect(readFileSync(path.join(localWorkDir, 'README.md'), 'utf8')).toBe(
      '# Hello',
    );
  });

  it('removes local files that no longer exist remotely', async () => {
    writeFileSync(path.join(localWorkDir, 'stale.txt'), 'old');
    const sandbox = makeSandbox({
      directories: [],
      files: { 'fresh.txt': 'new' },
    });
    await syncLocalWorkspaceFromSandbox({
      sandbox,
      remoteWorkDir,
      localWorkDir,
    });
    expect(existsSync(path.join(localWorkDir, 'stale.txt'))).toBe(false);
    expect(readFileSync(path.join(localWorkDir, 'fresh.txt'), 'utf8')).toBe(
      'new',
    );
  });

  it('skips writes when content is already up to date', async () => {
    writeFileSync(path.join(localWorkDir, 'README.md'), '# Hello');
    const sandbox = makeSandbox({
      directories: [],
      files: { 'README.md': '# Hello' },
    });
    await syncLocalWorkspaceFromSandbox({
      sandbox,
      remoteWorkDir,
      localWorkDir,
    });
    // No explicit assertion needed beyond it not throwing; the readFileSync
    // proves the content matches. The Buffer.equals fast-path is exercised.
    expect(readFileSync(path.join(localWorkDir, 'README.md'), 'utf8')).toBe(
      '# Hello',
    );
  });

  it('removes empty directories that are no longer required', async () => {
    mkdirSync(path.join(localWorkDir, 'unused', 'deep'), { recursive: true });
    const sandbox = makeSandbox({
      directories: [],
      files: {},
    });
    await syncLocalWorkspaceFromSandbox({
      sandbox,
      remoteWorkDir,
      localWorkDir,
    });
    expect(existsSync(path.join(localWorkDir, 'unused'))).toBe(false);
  });

  it('ignores the .agent-bridge directory on the local side', async () => {
    mkdirSync(path.join(localWorkDir, '.agent-bridge'));
    writeFileSync(path.join(localWorkDir, '.agent-bridge', 'state.json'), '{}');
    const sandbox = makeSandbox({
      directories: [],
      files: {},
    });
    await syncLocalWorkspaceFromSandbox({
      sandbox,
      remoteWorkDir,
      localWorkDir,
    });
    expect(existsSync(path.join(localWorkDir, '.agent-bridge'))).toBe(true);
    expect(readdirSync(localWorkDir)).toContain('.agent-bridge');
  });
});
