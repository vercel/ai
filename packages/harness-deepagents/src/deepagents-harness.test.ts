import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1StartOptions,
} from '@ai-sdk/harness';
import type * as NodeFsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  createDeepAgents,
  DEEPAGENTS_BUILTIN_TOOLS,
  DEEPAGENTS_DEFAULT_CONTEXT_WINDOW,
} from './deepagents-harness';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async (input: unknown, ...rest: unknown[]) => {
      const path = typeof input === 'string' ? input : String(input);
      if (path.endsWith('/bridge/index.mjs')) return '// mock bridge\n';
      if (path.endsWith('/bridge/package.json')) return '{"name":"mock"}';
      if (path.endsWith('/bridge/pnpm-lock.yaml'))
        return 'lockfileVersion: "9.0"\n';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (actual.readFile as any)(input, ...rest);
    }),
  };
});

describe('createDeepAgents', () => {
  it('reports the harness-v1 metadata', () => {
    const harness = createDeepAgents();
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.harnessId).toBe('deepagents');
    expect(harness.supportsBuiltinToolApprovals).toBe(false);
  });

  it('exposes the native LangGraph tool names via builtin tools', () => {
    expect(Object.keys(DEEPAGENTS_BUILTIN_TOOLS).sort()).toEqual([
      'bash',
      'grep',
      'read',
      'write',
    ]);
    expect(DEEPAGENTS_BUILTIN_TOOLS.read.nativeName).toBe('read_file');
    expect(DEEPAGENTS_BUILTIN_TOOLS.write.nativeName).toBe('write_file');
    expect(DEEPAGENTS_BUILTIN_TOOLS.bash.nativeName).toBe('shell');
    expect(DEEPAGENTS_BUILTIN_TOOLS.grep.nativeName).toBe('search');
  });

  it('has a default context window', () => {
    expect(DEEPAGENTS_DEFAULT_CONTEXT_WINDOW).toBe(200_000);
  });

  it('ships the node bridge files and a pnpm install command in its bootstrap', async () => {
    const harness = createDeepAgents();
    const bootstrap = await harness.getBootstrap!();
    expect(bootstrap.harnessId).toBe('deepagents');
    const paths = bootstrap.files.map(f => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bridge.mjs'),
        expect.stringContaining('package.json'),
        expect.stringContaining('pnpm-lock.yaml'),
      ]),
    );
    const commands = bootstrap.commands.map(c => c.command).join('\n');
    expect(commands).toContain('pnpm');
    expect(commands).toContain('install');
  });

  it('caches the bootstrap across calls', async () => {
    const harness = createDeepAgents();
    const a = await harness.getBootstrap!();
    const b = await harness.getBootstrap!();
    expect(a).toBe(b);
  });

  it('rejects a non-allow-all permission mode', async () => {
    const harness = createDeepAgents();
    await expect(
      harness.doStart({
        permissionMode: 'allow-reads',
      } as unknown as HarnessV1StartOptions),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('rejects resuming a session', async () => {
    const harness = createDeepAgents();
    await expect(
      harness.doStart({
        resumeFrom: {
          type: 'resume-session',
          harnessId: 'deepagents',
          specificationVersion: 'harness-v1',
          data: {},
        },
      } as unknown as HarnessV1StartOptions),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });
});
