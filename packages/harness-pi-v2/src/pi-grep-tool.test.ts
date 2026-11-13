import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import type { GrepToolInput } from '@earendil-works/pi-coding-agent';
import { describe, expect, test } from 'vitest';
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
