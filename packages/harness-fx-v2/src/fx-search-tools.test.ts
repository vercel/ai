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

const MIB = 1024 * 1024;

/**
 * Fake sandbox session whose commands print what a test scripts, so a test
 * controls how much output a search command or a context read produces, and
 * that records the commands and whether a command was stopped.
 */
function createFakeSearchSession(options: {
  /**
   * Returns the output of a command, and the exit code it ends with.
   */
  command: (command: string) => {
    chunks: () => Generator<Uint8Array>;
    exitCode?: number;
  };
  /**
   * Returns the stat of a path.
   */
  stat: (path: string) => { type: 'file' | 'directory'; size: number } | null;
}) {
  const calls: string[] = [];
  const state = { sent: 0, stopped: 0 };
  // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- partial sandbox session for a test.
  const session = {
    description: 'fake sandbox',
    async stat({ path }: { path: string }) {
      calls.push(`stat ${path}`);
      return options.stat(path);
    },
    async spawn({
      command,
      abortSignal,
    }: {
      command: string;
      abortSignal?: AbortSignal;
    }) {
      calls.push(command);
      const scripted = options.command(command);
      const iterator = scripted.chunks();
      let finished = false;
      let settle = () => {};
      const drained = new Promise<void>(resolve => {
        settle = resolve;
      });
      const aborted = new Promise<never>((_, reject) => {
        abortSignal?.addEventListener(
          'abort',
          () => {
            state.stopped++;
            reject(abortSignal.reason);
          },
          { once: true },
        );
      });
      return {
        stdout: new ReadableStream<Uint8Array>({
          pull(controller) {
            const { done, value } = iterator.next();
            if (done) {
              if (!finished) {
                finished = true;
                settle();
              }
              controller.close();
              return;
            }
            state.sent += value.length;
            controller.enqueue(value);
          },
        }),
        stderr: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
        async wait() {
          return Promise.race([
            drained.then(() => ({ exitCode: scripted.exitCode ?? 0 })),
            aborted,
          ]);
        },
        async kill() {
          state.stopped++;
        },
      };
    },
  } as unknown as FxToolSandbox['session'];
  return { session, calls, state };
}

function testSandbox(session: FxToolSandbox['session']): FxToolSandbox {
  return { session, workDir: '/home/user', home: '/home/user' };
}

describe('searching a sandbox that prints without end', () => {
  test('bounds the file listing of glob_files', async () => {
    const { session, state } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          for (;;) {
            yield new Uint8Array(
              Buffer.from('/home/user/src/file.ts\n', 'utf8'),
            );
          }
        },
      }),
    });

    const output = await globFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: '**/*.ts' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('the file listing was cut off');
    expect(state.sent).toBeLessThan(9 * MIB);
    expect(state.stopped).toBeGreaterThan(0);
  });

  test('bounds the match output of grep_files', async () => {
    const { session, state } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          for (;;) {
            yield new Uint8Array(
              Buffer.from('./src/file.ts:1:needle\n', 'utf8'),
            );
          }
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'needle' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('grep output was cut off');
    expect(state.sent).toBeLessThan(9 * MIB);
    expect(state.stopped).toBeGreaterThan(0);
  });

  test('drops a line a cut-off listing leaves half-written', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          // One file name that never ends, so the kept output has no newline.
          for (;;) {
            yield new Uint8Array(Buffer.alloc(64 * MIB, 0x61));
          }
        },
      }),
    });

    const output = await globFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'src/**' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('no matches for src/** in the listed part');
    expect(output.text).toContain('the file listing was cut off');
  });

  test('drops a match a cut-off output leaves half-written', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          for (;;) {
            yield new Uint8Array(Buffer.alloc(64 * MIB, 0x61));
          }
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'needle' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('no matches for needle');
    expect(output.text).toContain('grep output was cut off');
  });

  test('marks totals as lower bounds when the output was cut off', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          for (;;) {
            yield new Uint8Array(
              Buffer.from(`./src/file.ts:1:${'needle'.padEnd(40, '.')}\n`),
            );
          }
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'needle', head_limit: 1 },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('(showing 1-1 of at least ');
    expect(output.text).toContain('more matches available');
    expect(output.text).toContain('grep output was cut off');
  });

  test('bounds the number of matches it keeps', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          // More matches than the parser keeps, in far less than the byte
          // limit, so the match limit is what cuts the result off.
          for (let line = 0; line < 25_000; line++) {
            yield new Uint8Array(Buffer.from('./a.ts:1:x\n', 'utf8'));
          }
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'x' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('of at least 20000');
    expect(output.text).toContain('grep output was cut off');
  });

  test('bounds the count of grep_files for a cut-off output', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          for (;;) {
            yield new Uint8Array(
              Buffer.from('./src/file.ts:1:needle\n', 'utf8'),
            );
          }
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'needle', mode: 'count' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('at least; the grep output was cut off');
  });
});

describe('grep_files context lines', () => {
  test('skips a file over the context limit without reading it', async () => {
    const { session, calls } = createFakeSearchSession({
      stat: path =>
        path === '/home/user'
          ? { type: 'directory', size: 0 }
          : { type: 'file', size: 4 * MIB },
      command: () => ({
        chunks: function* () {
          yield new Uint8Array(Buffer.from('./big.txt:3:needle\n', 'utf8'));
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'needle', context_lines: 2 },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain(' - big.txt:3: needle');
    expect(output.text).not.toContain('big.txt:2-');
    expect(calls.filter(call => call.startsWith('base64'))).toEqual([]);
  });

  test('shows context lines of a file within the context limit', async () => {
    const session = await createJustBashNetworkSandboxSession();
    const workDir = session.defaultWorkingDirectory;
    await session.writeTextFile({
      path: `${workDir}/notes.txt`,
      content: 'one\ntwo needle\nthree\n',
    });
    const sandbox: FxToolSandbox = { session, workDir, home: workDir };

    expect(
      await grepFxFiles({
        sandbox,
        input: { pattern: 'needle', path: 'notes.txt', context_lines: 1 },
        abortSignal: new AbortController().signal,
      }),
    ).toMatchInlineSnapshot(`
      {
        "text": "[grep] 1 matches for needle
         notes.txt:1- one
       - notes.txt:2: two needle
         notes.txt:3- three
      ",
      }
    `);
  });
});
