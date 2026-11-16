import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import type { GrepToolInput } from '@earendil-works/pi-coding-agent';
import { describe, expect, test, vi } from 'vitest';
import { createPiGrepTool } from './pi-grep-tool';

async function setup() {
  const session = await createJustBashNetworkSandboxSession();
  const workDir = session.defaultWorkingDirectory;
  await session.writeTextFile({
    path: `${workDir}/src/a.ts`,
    content: 'const foo = 1;\nconst bar = 2;\nfoo(bar);\n',
  });
  await session.writeTextFile({ path: `${workDir}/b.txt`, content: 'Foo\n' });
  await session.writeTextFile({
    path: `${workDir}/node_modules/x.js`,
    content: 'foo\n',
  });
  const tool = createPiGrepTool({ session, workDir });
  const grep = (input: GrepToolInput) =>
    tool.execute('call-1', input, new AbortController().signal);
  return { session, workDir, grep };
}

function text(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content.map(part => part.text).join('');
}

describe('createPiGrepTool', () => {
  test('searches a directory recursively, skipping node_modules', async () => {
    const { grep } = await setup();

    expect(text(await grep({ pattern: 'foo' }))).toBe(
      'src/a.ts:1: const foo = 1;\nsrc/a.ts:3: foo(bar);',
    );
  });

  test('supports case-insensitive, literal and glob-filtered searches', async () => {
    const { grep } = await setup();

    expect(
      text(await grep({ pattern: 'foo', ignoreCase: true, glob: '*.txt' })),
    ).toBe('b.txt:1: Foo');
    expect(text(await grep({ pattern: 'foo(', literal: true }))).toBe(
      'src/a.ts:3: foo(bar);',
    );
  });

  test('searches a single file and shows context lines', async () => {
    const { grep } = await setup();

    expect(
      text(await grep({ pattern: 'bar = ', path: 'src/a.ts', context: 1 })),
    ).toBe('a.ts-1- const foo = 1;\na.ts:2: const bar = 2;\na.ts-3- foo(bar);');
  });

  test('reads context lines in the sandbox without loading the file', async () => {
    const { session, workDir, grep } = await setup();
    const lines = Array.from(
      { length: 200_000 },
      (_value, index) => `line ${index + 1}`,
    );
    await session.writeTextFile({
      path: `${workDir}/large.txt`,
      content: `${lines.join('\n')}\n`,
    });
    const readTextFile = vi.spyOn(session, 'readTextFile');
    const readBinaryFile = vi.spyOn(session, 'readBinaryFile');

    const result = await grep({
      pattern: 'line 199999$',
      path: 'large.txt',
      context: 1,
    });

    expect(text(result)).toBe(
      'large.txt-199998- line 199998\nlarge.txt:199999: line 199999\nlarge.txt-200000- line 200000',
    );
    expect(readTextFile).not.toHaveBeenCalled();
    expect(readBinaryFile).not.toHaveBeenCalled();
  });

  test('bounds the context lines of files with very long lines', async () => {
    const { session, workDir, grep } = await setup();
    await session.writeTextFile({
      path: `${workDir}/wide.txt`,
      content: `${'x'.repeat(400_000)}\nmatch\n${'y'.repeat(400_000)}\n`,
    });

    const result = await grep({
      pattern: '^match$',
      path: 'wide.txt',
      context: 1,
    });

    expect(text(result)).toContain('wide.txt:2: match');
    // The context lines are cut in the sandbox, so they fit and stay bounded.
    expect(text(result)).toContain('wide.txt-1- x');
    expect(text(result)).toContain('wide.txt-3- y');
    expect(text(result)).toContain('Some lines truncated to 500 chars');
    expect(text(result).length).toBeLessThan(4000);
  });

  test('omits context that would exceed the per-file ranges', async () => {
    const { session, workDir, grep } = await setup();
    const lines = Array.from({ length: 3000 }, (_value, index) =>
      index % 5 === 0 ? 'match' : `line ${index}`,
    );
    await session.writeTextFile({
      path: `${workDir}/many.txt`,
      content: `${lines.join('\n')}\n`,
    });

    const result = await grep({
      pattern: '^match$',
      path: 'many.txt',
      limit: 600,
      context: 1,
    });

    // Every match is still shown, while the context reads are capped.
    expect(text(result).match(/many\.txt:\d+: match/gm)).toHaveLength(600);
    expect(text(result)).toContain(
      'Some context lines omitted for large files',
    );
  });

  test('bounds a matching line that is far longer than the result', async () => {
    const { session, workDir, grep } = await setup();
    await session.writeTextFile({
      path: `${workDir}/long.txt`,
      content: `${'a'.repeat(2_000_000)}\n`,
    });

    const result = await grep({ pattern: 'aaaaa', path: 'long.txt' });

    expect(text(result).startsWith('long.txt:1: aaaaa')).toBe(true);
    expect(text(result).length).toBeLessThan(1000);
  });

  test('keeps the matching line complete when a long line precedes it', async () => {
    const { session, workDir, grep } = await setup();
    // The context read for line 1 uses up all but a few bytes of its limit.
    await session.writeTextFile({
      path: `${workDir}/wide.txt`,
      content: `${'x'.repeat(262_138)}\nconst match = 1;\n`,
    });

    const result = await grep({
      pattern: 'const match',
      path: 'wide.txt',
      context: 1,
    });

    expect(text(result)).toContain('wide.txt:2: const match = 1;');
  });

  test('keeps every match when the matching lines are long', async () => {
    const { session, workDir, grep } = await setup();
    const longLine = `match ${'a'.repeat(12_000)}`;
    await session.writeTextFile({
      path: `${workDir}/bundle.min.js`,
      content: `${Array.from({ length: 120 }, () => longLine).join('\n')}\n`,
    });

    const result = await grep({ pattern: 'match', path: 'bundle.min.js' });

    expect(result.details?.matchLimitReached).toBe(100);
    expect(text(result)).not.toContain('Some matches may be missing');
  });

  test('shows context for a file whose name contains an equals sign', async () => {
    const { session, workDir, grep } = await setup();
    await session.writeTextFile({
      path: `${workDir}/a=b.txt`,
      content: 'first\nmatch me\nlast\n',
    });

    expect(
      text(await grep({ pattern: 'match me', path: 'a=b.txt', context: 1 })),
    ).toBe('a=b.txt-1- first\na=b.txt:2: match me\na=b.txt-3- last');
  });

  test('reports the match limit', async () => {
    const { grep } = await setup();

    const result = await grep({ pattern: 'foo', limit: 1 });

    expect(text(result)).toBe(
      'src/a.ts:1: const foo = 1;\n\n[1 matches limit reached. Use limit=2 for more, or refine pattern]',
    );
    expect(result.details).toEqual({ matchLimitReached: 1 });
  });

  test('reports no matches, missing paths and invalid patterns', async () => {
    const { workDir, grep } = await setup();

    expect(text(await grep({ pattern: 'nothing' }))).toBe('No matches found');
    await expect(grep({ pattern: 'foo', path: 'missing' })).rejects.toThrow(
      `Path not found: ${workDir}/missing`,
    );
    await expect(grep({ pattern: '(' })).rejects.toThrow();
  });
});
