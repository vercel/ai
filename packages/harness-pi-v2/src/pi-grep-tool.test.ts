import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import type { GrepToolInput } from '@earendil-works/pi-coding-agent';
import { describe, expect, test, vi } from 'vitest';
import { createPiGrepTool } from './pi-grep-tool';

/**
 * Output of a recursive search as the sandbox frames it: `path\0 line:text … \0`
 * per file, followed by the marker that a complete search prints.
 */
function framedOutput(blocks: string[]): string {
  const nul = '\u0000';
  return `${blocks.join(nul)}${nul}/pi-grep-complete${nul}`;
}

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
      { length: 50_000 },
      (_value, index) => `line ${index + 1}`,
    );
    await session.writeTextFile({
      path: `${workDir}/large.txt`,
      content: `${lines.join('\n')}\n`,
    });
    const readTextFile = vi.spyOn(session, 'readTextFile');
    const readBinaryFile = vi.spyOn(session, 'readBinaryFile');

    const result = await grep({
      pattern: 'line 49999$',
      path: 'large.txt',
      context: 1,
    });

    expect(text(result)).toBe(
      'large.txt-49998- line 49998\nlarge.txt:49999: line 49999\nlarge.txt-50000- line 50000',
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
    // 501 matches four lines apart, so one range more than the cap allows.
    const lines = Array.from({ length: 2001 }, (_value, index) =>
      index % 4 === 0 ? 'match' : `line ${index}`,
    );
    await session.writeTextFile({
      path: `${workDir}/many.txt`,
      content: `${lines.join('\n')}\n`,
    });

    /*
     * Running the cap's 500 ranges through the sandbox double takes most of a
     * second, so the search runs for real and the context read only records
     * the command it would run.
     */
    const contextCommands: string[] = [];
    const run = session.run.bind(session);
    vi.spyOn(session, 'run').mockImplementation(async options => {
      if (!options.command.includes('NR>=')) return run(options);
      contextCommands.push(options.command);
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const result = await grep({
      pattern: '^match$',
      path: 'many.txt',
      limit: 600,
      context: 1,
    });

    // Every match is still shown, while the context reads are capped.
    expect(text(result).match(/many\.txt:\d+: match/gm)).toHaveLength(501);
    expect(contextCommands).toHaveLength(1);
    expect(contextCommands[0]!.match(/NR>=/g)).toHaveLength(500);
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

  test('searches files whose names contain colon digits colon', async () => {
    const { session, workDir, grep } = await setup();
    // The prefix of the crafted name is a real, tiny file, as in the report.
    await session.writeTextFile({ path: `${workDir}/a`, content: 'tiny\n' });
    await session.writeTextFile({
      path: `${workDir}/a:999999999999999999:b.txt`,
      content: 'before\nmatch after\nafter\n',
    });
    await session.writeTextFile({
      path: `${workDir}/c:123:d.txt`,
      content: 'x\nmatch here\n',
    });

    const result = await grep({ pattern: 'match', context: 1 });

    expect(text(result)).toContain(
      'a:999999999999999999:b.txt-1- before\na:999999999999999999:b.txt:2: match after\na:999999999999999999:b.txt-3- after',
    );
    expect(text(result)).toContain(
      'c:123:d.txt-1- x\nc:123:d.txt:2: match here',
    );
    expect(text(result).split('\n')).toHaveLength(5);
  });

  test('drops a match with an unsafe line number', async () => {
    const { session, grep } = await setup();
    const run = session.run.bind(session);
    const framed = framedOutput([
      './crafted.txt',
      '99999999999999999999:match\n',
      './plain.txt',
      '2:ok\n',
    ]);
    vi.spyOn(session, 'run').mockImplementation(async options => {
      if (options.command.includes('NR>=')) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: framed, stderr: '' };
    });

    const result = await grep({ pattern: 'match', context: 1 });

    // The unsafe line number is dropped instead of being rendered.
    expect(text(result)).toBe('plain.txt:2: ok');
  });

  test('strips the directory prefix that GNU grep prints', async () => {
    const { session, grep } = await setup();
    const framed = framedOutput(['././src/a.ts', '1:const foo = 1;\n']);
    vi.spyOn(session, 'run').mockResolvedValue({
      exitCode: 0,
      stdout: framed,
      stderr: '',
    });

    const result = await grep({ pattern: 'foo' });

    expect(text(result)).toBe('src/a.ts:1: const foo = 1;');
  });

  test('drops a block whose path leaves the directory', async () => {
    const { session, grep } = await setup();
    const framed = framedOutput([
      '../../etc/hosts',
      '1:127.0.0.1 match\n',
      './plain.txt',
      '2:ok\n',
    ]);
    vi.spyOn(session, 'run').mockResolvedValue({
      exitCode: 0,
      stdout: framed,
      stderr: '',
    });

    const result = await grep({ pattern: 'match' });

    expect(text(result)).toBe('plain.txt:2: ok');
  });

  test('reports a cut file list when no match is shown', async () => {
    const { session, grep } = await setup();
    // The search listed more files than the cap, and none of them printed a
    // `line:text`, which is what a binary file does on the Vercel sandbox.
    const framed = framedOutput(['./a.png', '', './b.png', '']);
    vi.spyOn(session, 'run').mockResolvedValue({
      exitCode: 0,
      stdout: framed,
      stderr: '',
    });

    const result = await grep({ pattern: 'match', limit: 1 });

    expect(text(result)).toBe(
      'No matches found\n\n[Some matches may be missing, the output reached its limit]',
    );
  });

  test('keeps a match whose line contains a NUL byte in its own file', async () => {
    const { session, workDir, grep } = await setup();
    // A file whose matching line holds a NUL byte must not be able to end the
    // frame of its file and name another one.
    await session.writeBinaryFile({
      path: `${workDir}/nul.txt`,
      content: new Uint8Array([0x6d, 0x61, 0x74, 0x63, 0x68, 0x00, 0x78, 0x0a]),
    });
    await session.writeTextFile({
      path: `${workDir}/plain.txt`,
      content: 'match\n',
    });

    const result = await grep({ pattern: 'match' });

    expect(text(result)).toContain('nul.txt:1: matchx');
    expect(text(result)).toContain('plain.txt:1: match');
    expect(text(result).split('\n')).toHaveLength(2);
  });

  test('bounds the result when many lines match with context', async () => {
    const { session, workDir, grep } = await setup();
    const content = Array.from(
      { length: 4000 },
      (_, index) => `line ${index + 1} match`,
    ).join('\n');
    await session.writeTextFile({ path: `${workDir}/many.txt`, content });

    const result = await grep({ pattern: 'match', context: 1, limit: 4000 });

    expect(text(result)).toContain('many.txt:1: line 1 match');
    // The result stops at the display limit instead of rendering every match.
    expect(text(result)).not.toContain('line 4000 match');
    expect(text(result).length).toBeLessThan(300_000);
  });

  test('reports a recursive output that the byte cap cut', async () => {
    const { session, grep } = await setup();
    const nul = '\u0000';
    // One frame whose match lines the byte cap cut, so the marker is missing.
    const body = `${`1:${'x'.repeat(2000)}`}\n`.repeat(600);
    vi.spyOn(session, 'run').mockResolvedValue({
      exitCode: 0,
      stdout: ['./a.txt', body].join(nul),
      stderr: '',
    });

    const result = await grep({ pattern: 'x', limit: 5000 });

    expect(text(result)).toContain(
      'Some matches may be missing, the output reached its limit',
    );
  });

  test('refuses a recursive output without the NUL framing', async () => {
    const { session, grep } = await setup();
    vi.spyOn(session, 'run').mockResolvedValue({
      exitCode: 0,
      stdout: './a.txt1:match\n',
      stderr: '',
    });

    await expect(grep({ pattern: 'match' })).rejects.toThrow('NUL framing');
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
    await expect(grep({ pattern: '(' })).rejects.toThrow(
      /invalid regular expression|Unmatched/i,
    );
  });
});
