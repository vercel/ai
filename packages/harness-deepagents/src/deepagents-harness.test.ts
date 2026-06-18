import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1StartOptions,
} from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import {
  createDeepAgents,
  DEEPAGENTS_BUILTIN_TOOLS,
  DEEPAGENTS_DEFAULT_CONTEXT_WINDOW,
} from './deepagents-harness';

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

  it('ships the python bridge files and a pip install command in its bootstrap', async () => {
    const harness = createDeepAgents();
    const bootstrap = await harness.getBootstrap!();
    expect(bootstrap.harnessId).toBe('deepagents');
    const paths = bootstrap.files.map(f => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bridge.py'),
        expect.stringContaining('bridge_runtime.py'),
        expect.stringContaining('requirements.txt'),
      ]),
    );
    const commands = bootstrap.commands.map(c => c.command).join('\n');
    expect(commands).toContain('pip install');
    expect(commands).toContain('requirements.txt');
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
