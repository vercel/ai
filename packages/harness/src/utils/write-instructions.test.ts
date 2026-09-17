import { describe, expect, it } from 'vitest';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { writeInstructions } from './write-instructions';

function makeSandbox() {
  const files = new Map<string, string>();
  const runs: string[] = [];
  const writes: Array<{ path: string; content: string }> = [];

  const sandbox = {
    async run({ command }: { command: string }) {
      runs.push(command);
      if (command.startsWith('mv -f ')) {
        const [source, target] = quotedValues(command);
        files.set(target!, files.get(source!)!);
        files.delete(source!);
      }
      if (command.startsWith('rm -f -- ')) {
        for (const target of quotedValues(command)) {
          files.delete(target);
        }
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    async readTextFile({ path }: { path: string }) {
      return files.get(path) ?? null;
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      writes.push({ path, content });
      files.set(path, content);
    },
  } as unknown as Experimental_SandboxSession;

  return { sandbox, files, runs, writes };
}

function quotedValues(command: string): string[] {
  return Array.from(command.matchAll(/'([^']*)'/g), match => match[1]!);
}

describe('writeInstructions', () => {
  it('writes instructions to a non-existent file and creates companion metadata', async () => {
    const state = makeSandbox();
    const result = await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'Always run tests.',
    });

    expect(result).toEqual({
      changed: true,
      filePath: '/home/user/AGENTS.md',
    });
    expect(state.files.get('/home/user/AGENTS.md')).toBe('Always run tests.\n');
    expect(
      JSON.parse(
        state.files.get(
          '/home/user/.AGENTS.md.ai-sdk-harness-instructions.json',
        )!,
      ),
    ).toEqual({
      version: 1,
      originalContent: null,
      instructions: 'Always run tests.',
      appliedContent: 'Always run tests.\n',
    });
  });

  it('appends instructions to an existing file without overriding pre-existing content', async () => {
    const state = makeSandbox();
    state.files.set(
      '/home/user/AGENTS.md',
      '# Project Guidelines\n\nBe thorough.',
    );

    const result = await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'Always run tests.',
    });

    expect(result).toEqual({
      changed: true,
      filePath: '/home/user/AGENTS.md',
    });
    expect(state.files.get('/home/user/AGENTS.md')).toBe(
      '# Project Guidelines\n\nBe thorough.\n\nAlways run tests.\n',
    );
    expect(
      JSON.parse(
        state.files.get(
          '/home/user/.AGENTS.md.ai-sdk-harness-instructions.json',
        )!,
      ),
    ).toEqual({
      version: 1,
      originalContent: '# Project Guidelines\n\nBe thorough.',
      instructions: 'Always run tests.',
      appliedContent:
        '# Project Guidelines\n\nBe thorough.\n\nAlways run tests.\n',
    });
  });

  it('subsequent call with different instructions replaces previous instructions', async () => {
    const state = makeSandbox();
    state.files.set(
      '/home/user/AGENTS.md',
      '# Project Guidelines\n\nBe thorough.',
    );

    await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'First instructions.',
    });

    const result = await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'Updated instructions.',
    });

    expect(result).toEqual({
      changed: true,
      filePath: '/home/user/AGENTS.md',
    });
    expect(state.files.get('/home/user/AGENTS.md')).toBe(
      '# Project Guidelines\n\nBe thorough.\n\nUpdated instructions.\n',
    );
    expect(
      JSON.parse(
        state.files.get(
          '/home/user/.AGENTS.md.ai-sdk-harness-instructions.json',
        )!,
      ),
    ).toEqual({
      version: 1,
      originalContent: '# Project Guidelines\n\nBe thorough.',
      instructions: 'Updated instructions.',
      appliedContent:
        '# Project Guidelines\n\nBe thorough.\n\nUpdated instructions.\n',
    });
  });

  it('idempotent call with same instructions returns changed: false with zero writes', async () => {
    const state = makeSandbox();
    await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'Always run tests.',
    });

    const writesCount = state.writes.length;
    const runsCount = state.runs.length;

    const result = await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'Always run tests.',
    });

    expect(result).toEqual({
      changed: false,
      filePath: '/home/user/AGENTS.md',
    });
    expect(state.writes).toHaveLength(writesCount);
    expect(state.runs).toHaveLength(runsCount);
  });

  it('clearing instructions restores pre-existing content and deletes companion metadata', async () => {
    const state = makeSandbox();
    state.files.set(
      '/home/user/AGENTS.md',
      '# Project Guidelines\n\nBe thorough.\n',
    );

    await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'Always run tests.',
    });

    const result = await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: undefined,
    });

    expect(result).toEqual({
      changed: true,
      filePath: '/home/user/AGENTS.md',
    });
    expect(state.files.get('/home/user/AGENTS.md')).toBe(
      '# Project Guidelines\n\nBe thorough.\n',
    );
    expect(
      state.files.has('/home/user/.AGENTS.md.ai-sdk-harness-instructions.json'),
    ).toBe(false);
  });

  it('clearing instructions on a harness-created file removes the file and metadata', async () => {
    const state = makeSandbox();
    await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'Temporary instructions.',
    });

    expect(state.files.has('/home/user/AGENTS.md')).toBe(true);

    const result = await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: '',
    });

    expect(result).toEqual({
      changed: true,
      filePath: '/home/user/AGENTS.md',
    });
    expect(state.files.has('/home/user/AGENTS.md')).toBe(false);
    expect(
      state.files.has('/home/user/.AGENTS.md.ai-sdk-harness-instructions.json'),
    ).toBe(false);
  });

  it('clearing instructions when no metadata exists is a no-op', async () => {
    const state = makeSandbox();
    state.files.set('/home/user/AGENTS.md', '# Unmanaged');

    const result = await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: undefined,
    });

    expect(result).toEqual({
      changed: false,
      filePath: '/home/user/AGENTS.md',
    });
    expect(state.files.get('/home/user/AGENTS.md')).toBe('# Unmanaged');
  });

  it('preserves external edits made while instructions were active', async () => {
    const state = makeSandbox();
    state.files.set('/home/user/AGENTS.md', '# Base\n');

    await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'First instructions.',
    });

    state.files.set(
      '/home/user/AGENTS.md',
      '# Base\n\n# User Section\n\nFirst instructions.\n',
    );

    await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'Second instructions.',
    });

    expect(state.files.get('/home/user/AGENTS.md')).toBe(
      '# Base\n\n# User Section\n\nSecond instructions.\n',
    );

    await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: '',
    });

    expect(state.files.get('/home/user/AGENTS.md')).toBe(
      '# Base\n\n# User Section\n',
    );
  });

  it('manages multiple target files in the same directory independently', async () => {
    const state = makeSandbox();
    await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'AGENTS.md',
      instructions: 'Codex instructions.',
    });

    await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'CLAUDE.md',
      instructions: 'Claude instructions.',
    });

    expect(state.files.get('/home/user/AGENTS.md')).toBe(
      'Codex instructions.\n',
    );
    expect(state.files.get('/home/user/CLAUDE.md')).toBe(
      'Claude instructions.\n',
    );
    expect(
      state.files.has('/home/user/.AGENTS.md.ai-sdk-harness-instructions.json'),
    ).toBe(true);
    expect(
      state.files.has('/home/user/.CLAUDE.md.ai-sdk-harness-instructions.json'),
    ).toBe(true);

    await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: 'CLAUDE.md',
      instructions: undefined,
    });

    expect(state.files.has('/home/user/CLAUDE.md')).toBe(false);
    expect(
      state.files.has('/home/user/.CLAUDE.md.ai-sdk-harness-instructions.json'),
    ).toBe(false);
    expect(state.files.get('/home/user/AGENTS.md')).toBe(
      'Codex instructions.\n',
    );
    expect(
      state.files.has('/home/user/.AGENTS.md.ai-sdk-harness-instructions.json'),
    ).toBe(true);
  });

  it('manages nested target paths cleanly', async () => {
    const state = makeSandbox();
    const result = await writeInstructions({
      sandbox: state.sandbox,
      homePath: '/home/user',
      instructionsFile: '.claude/CLAUDE.md',
      instructions: 'Nested instructions.',
    });

    expect(result).toEqual({
      changed: true,
      filePath: '/home/user/.claude/CLAUDE.md',
    });
    expect(state.files.get('/home/user/.claude/CLAUDE.md')).toBe(
      'Nested instructions.\n',
    );
    expect(
      state.files.has(
        '/home/user/.claude/.CLAUDE.md.ai-sdk-harness-instructions.json',
      ),
    ).toBe(true);
  });

  it('rejects invalid homePath', async () => {
    const state = makeSandbox();
    await expect(
      writeInstructions({
        sandbox: state.sandbox,
        homePath: 'relative/home',
        instructionsFile: 'AGENTS.md',
        instructions: 'Test',
      }),
    ).rejects.toThrow(
      'Invalid homePath "relative/home": expected an absolute POSIX path.',
    );

    await expect(
      writeInstructions({
        sandbox: state.sandbox,
        homePath: '   ',
        instructionsFile: 'AGENTS.md',
        instructions: 'Test',
      }),
    ).rejects.toThrow('Invalid homePath: expected a non-empty string.');
  });

  it.each([
    { instructionsFile: '/AGENTS.md', reason: 'absolute POSIX path' },
    { instructionsFile: 'C:\\AGENTS.md', reason: 'Windows absolute path' },
    { instructionsFile: 'sub\\AGENTS.md', reason: 'Windows separator' },
    { instructionsFile: '../AGENTS.md', reason: 'parent traversal' },
    { instructionsFile: 'foo/../../bar.md', reason: 'nested traversal' },
    { instructionsFile: '', reason: 'empty path' },
    { instructionsFile: '   ', reason: 'whitespace path' },
    { instructionsFile: '.', reason: 'dot path' },
    { instructionsFile: './', reason: 'dot-slash path' },
    { instructionsFile: 'sub/', reason: 'trailing slash directory' },
    { instructionsFile: 'sub/.', reason: 'sub dot path' },
    { instructionsFile: 'sub/..', reason: 'sub dot-dot path' },
  ])(
    'rejects invalid instructionsFile $instructionsFile ($reason)',
    async ({ instructionsFile }) => {
      const state = makeSandbox();
      await expect(
        writeInstructions({
          sandbox: state.sandbox,
          homePath: '/home/user',
          instructionsFile,
          instructions: 'Test',
        }),
      ).rejects.toThrow('expected a relative POSIX path without traversal');
    },
  );
});
