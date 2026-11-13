import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, test } from 'vitest';
import type { FxToolSandbox } from './fx-builtin-tools';
import { globFxFiles, grepFxFiles, matchesFxGlob } from './fx-search-tools';

async function setup() {
  const session = await createJustBashNetworkSandboxSession();
  const workDir = session.defaultWorkingDirectory;
  const sandbox: FxToolSandbox = { session, workDir, home: workDir };
  const abortSignal = new AbortController().signal;
  for (const [path, content] of Object.entries({
    'src/a.ts': 'export const answer = 42;\n',
    'src/nested/b.ts': 'const Answer = "forty-two";\n',
    'README.md': 'The answer is here.\n',
    'node_modules/pkg/index.ts': 'export const answer = 0;\n',
  })) {
    await session.writeTextFile({ path: `${workDir}/${path}`, content });
  }
  return { sandbox, abortSignal };
}

describe('matchesFxGlob', () => {
  test('matches globstar, segment and last-segment patterns', () => {
    expect(matchesFxGlob({ pattern: 'src/**/*.ts', path: 'src/a.ts' })).toBe(
      true,
    );
    expect(
      matchesFxGlob({ pattern: 'src/**/*.ts', path: 'src/nested/b.ts' }),
    ).toBe(true);
    expect(matchesFxGlob({ pattern: '*.md', path: 'README.md' })).toBe(true);
    expect(matchesFxGlob({ pattern: '*.ts', path: 'src/a.ts' })).toBe(true);
    expect(
      matchesFxGlob({ pattern: 'src/*.ts', path: 'src/nested/b.ts' }),
    ).toBe(false);
  });
});

describe('globFxFiles', () => {
  test('lists matching files, skipping ignored directories', async () => {
    const { sandbox, abortSignal } = await setup();

    expect(
      await globFxFiles({
        sandbox,
        input: { pattern: '**/*.ts' },
        abortSignal,
      }),
    ).toMatchInlineSnapshot(`
      {
        "text": "[glob] 2 matches for **/*.ts
       - src/a.ts
       - src/nested/b.ts
      ",
      }
    `);
  });

  test('counts matching files', async () => {
    const { sandbox, abortSignal } = await setup();

    expect(
      await globFxFiles({
        sandbox,
        input: { pattern: '**/*', mode: 'count' },
        abortSignal,
      }),
    ).toMatchInlineSnapshot(`
      {
        "text": "[glob] count 3 matches for **/*
      ",
      }
    `);
  });
});

describe('grepFxFiles', () => {
  test('finds literal matches', async () => {
    const { sandbox, abortSignal } = await setup();

    expect(
      await grepFxFiles({ sandbox, input: { pattern: 'answer' }, abortSignal }),
    ).toMatchInlineSnapshot(`
      {
        "text": "[grep] 2 matches for answer
       - README.md:1: The answer is here.
       - src/a.ts:1: export const answer = 42;
      ",
      }
    `);
  });

  test('finds case-insensitive matches', async () => {
    const { sandbox, abortSignal } = await setup();

    expect(
      await grepFxFiles({
        sandbox,
        input: { pattern: 'answer', case_insensitive: true, path: 'src' },
        abortSignal,
      }),
    ).toMatchInlineSnapshot(`
      {
        "text": "[grep] 2 matches for answer
       - src/a.ts:1: export const answer = 42;
       - src/nested/b.ts:1: const Answer = "forty-two";
      ",
      }
    `);
  });
});
