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
const workDir = '/home/user';

/**
 * Fake sandbox session whose commands print what a test scripts, so a test
 * controls how much output a search command or a context read produces, and
 * that records the commands and whether a command was stopped.
 */
/**
 * Frames the grep output of one file the way the sandbox sends it: its path,
 * a NUL byte, its `line:text` lines and a NUL byte, so that a file name can
 * never be read as a line number.
 */
function frame(options: { path: string; lines: string[] }): string {
  return `${options.path}\u0000${options.lines.map(line => `${line}\n`).join('')}\u0000`;
}

/**
 * Frames the grep output of several files, so a test can script more matches
 * than one file may return.
 */
function framedFiles(options: {
  files: number;
  linesPerFile: number;
  line: string;
}): string {
  return Array.from({ length: options.files }, (_, index) =>
    frame({
      path: `./f${index}.ts`,
      lines: Array(options.linesPerFile).fill(options.line),
    }),
  ).join('');
}

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
          yield new Uint8Array(Buffer.from('./src/file.ts\u0000', 'utf8'));
          for (;;) {
            yield new Uint8Array(Buffer.from('1:needle\n', 'utf8'));
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

  test('drops a path a cut-off listing leaves half-written', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          for (let line = 0; line < 10; line++) {
            yield new Uint8Array(
              Buffer.from(`${workDir}/src/complete.ts\n`, 'utf8'),
            );
          }
          // A path that never ends, so the kept output ends inside it.
          yield new Uint8Array(Buffer.from(`${workDir}/src/half`, 'utf8'));
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

    expect(output.text).toContain('src/complete.ts');
    expect(output.text).not.toContain('src/half');
    expect(output.text).toContain('the file listing was cut off');
  });

  test('drops a match a cut-off output leaves half-written', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          yield new Uint8Array(
            Buffer.from(
              frame({ path: './src/a.ts', lines: Array(10).fill('1:needle') }),
              'utf8',
            ),
          );
          // A file whose block never ends, so the kept output stops inside it
          // and the block has no closing NUL.
          yield new Uint8Array(Buffer.from('./src/b.ts\u0000', 'utf8'));
          yield new Uint8Array(Buffer.from('1:needle', 'utf8'));
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

    expect(output.text).toContain('src/a.ts:1: needle');
    expect(output.text).not.toContain('src/b.ts');
    expect(output.text).toContain('grep output was cut off');
  });

  test('bounds the number of files it lists, keeping them sorted', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          for (let file = 0; file < 100_100; file++) {
            yield new Uint8Array(
              Buffer.from(`${workDir}/src/file${file}.ts\n`, 'utf8'),
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

    expect(output.text).toContain(
      'the file listing was cut off after 100000 files',
    );
    expect(output.text).not.toContain('cut off after 8388608 bytes');
    const listed = output.text
      .split('\n')
      .filter(line => line.startsWith(' - '))
      .map(line => line.slice(3));
    expect(listed.length).toBeGreaterThan(0);
    expect(listed).toEqual([...listed].sort());
  });

  test('lists the files a pattern matches in a tree of many others', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          // More files than the listing limit, none of them matching, before
          // the ones that do.
          for (let file = 0; file < 100_100; file++) {
            yield new Uint8Array(
              Buffer.from(`${workDir}/other/f${file}.js\n`, 'utf8'),
            );
          }
          for (const name of ['a', 'b']) {
            yield new Uint8Array(
              Buffer.from(`${workDir}/src/${name}.ts\n`, 'utf8'),
            );
          }
        },
      }),
    });

    expect(
      await globFxFiles({
        sandbox: testSandbox(session),
        input: { pattern: 'src/**' },
        abortSignal: new AbortController().signal,
      }),
    ).toEqual({
      text: '[glob] 2 matches for src/**\n - src/a.ts\n - src/b.ts\n',
    });
    expect(
      await globFxFiles({
        sandbox: testSandbox(session),
        input: { pattern: 'src/**', mode: 'count' },
        abortSignal: new AbortController().signal,
      }),
    ).toEqual({ text: '[glob] count 2 matches for src/**\n' });
  });

  test('marks a page as a lower bound when only the output was cut off', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          yield new Uint8Array(Buffer.from('./src/a.ts\u0000', 'utf8'));
          for (;;) {
            // 1 KiB lines, so the byte limit is reached long before the
            // match limit.
            yield new Uint8Array(
              Buffer.from(`1:${'x'.repeat(1020)}\n`, 'utf8'),
            );
          }
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'x', head_limit: 1 },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('(showing 1-1 of at least ');
    expect(output.text).toContain('grep output was cut off');
    expect(output.text).not.toContain('more than 20000 matches');
  });

  test('marks totals as lower bounds when the output was cut off', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          yield new Uint8Array(Buffer.from('./src/file.ts\u0000', 'utf8'));
          for (;;) {
            yield new Uint8Array(
              Buffer.from(`1:${'needle'.padEnd(40, '.')}\n`),
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
          // limit and no more per file than one file may return, so the match
          // limit is what cuts the result off.
          yield new Uint8Array(
            Buffer.from(
              framedFiles({ files: 11, linesPerFile: 2000, line: '1:x' }),
              'utf8',
            ),
          );
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'x' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('of at least 20000');
    expect(output.text).toContain('more than 20000 matches');
  });

  test('counts only the matches the include filter keeps', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          // More matches than the match limit in a file the filter drops, and
          // a few in one it keeps.
          yield new Uint8Array(
            Buffer.from(
              frame({
                path: './other/f.ts',
                lines: Array(25_000).fill('1:x'),
              }),
              'utf8',
            ),
          );
          yield new Uint8Array(
            Buffer.from(
              frame({ path: './docs/f.ts', lines: Array(5).fill('1:x') }),
              'utf8',
            ),
          );
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'x', include: 'docs/**' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('[grep] 5 matches for x');
    expect(output.text).not.toContain('at least');
  });

  test('counts a large number of matches exactly', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          yield new Uint8Array(
            Buffer.from(
              framedFiles({ files: 13, linesPerFile: 1923, line: '1:x' }),
              'utf8',
            ),
          );
        },
      }),
    });

    expect(
      await grepFxFiles({
        sandbox: testSandbox(session),
        input: { pattern: 'x', mode: 'count' },
        abortSignal: new AbortController().signal,
      }),
    ).toEqual({
      text: '[grep] count 24999 matching lines in 13 files for x\n',
    });
  });

  test('lists the files of a large number of matches exactly', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          yield new Uint8Array(
            Buffer.from(
              framedFiles({ files: 25, linesPerFile: 500, line: '1:x' }),
              'utf8',
            ),
          );
        },
      }),
    });

    expect(
      await grepFxFiles({
        sandbox: testSandbox(session),
        input: { pattern: 'x', mode: 'files_with_matches' },
        abortSignal: new AbortController().signal,
      }),
    ).toEqual({
      text:
        '[grep] 25 files with matches for x\n' +
        Array.from({ length: 25 }, (_, index) => `f${index}.ts`)
          .sort()
          .map(name => ` - ${name}\n`)
          .join(''),
    });
  });

  test('bounds the count of grep_files for a cut-off output', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          yield new Uint8Array(Buffer.from('./src/file.ts\u0000', 'utf8'));
          for (;;) {
            yield new Uint8Array(Buffer.from('1:needle\n', 'utf8'));
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

describe('grep_files with a crafted file name', () => {
  test('reads a name with a line number as the file it is', async () => {
    const session = await createJustBashNetworkSandboxSession();
    const workDir = session.defaultWorkingDirectory;
    await session.writeTextFile({ path: `${workDir}/a`, content: 'tiny\n' });
    await session.writeTextFile({
      path: `${workDir}/a:9007199254740994:b.txt`,
      content: 'before\nmatch after\nafter\n',
    });

    const output = await grepFxFiles({
      sandbox: { session, workDir, home: workDir },
      input: { pattern: 'match', context_lines: 1 },
      abortSignal: new AbortController().signal,
    });

    // The name is a path, not the file `a` at line 9007199254740994, whose
    // context loop used to run on a number that never advanced.
    expect(output.text).toContain('a:9007199254740994:b.txt:1- before');
    expect(output.text).toContain(' - a:9007199254740994:b.txt:2: match after');
    expect(output.text).toContain('a:9007199254740994:b.txt:3- after');
    expect(output.text).not.toContain(' - a:2:');
  });

  test('drops a match whose line number is not a positive safe integer', async () => {
    const { session } = createFakeSearchSession({
      stat: path =>
        path === workDir
          ? { type: 'directory', size: 0 }
          : { type: 'file', size: 10 },
      command: command => ({
        chunks: function* () {
          if (command.startsWith('base64')) {
            // The context read succeeds, so the lines around the match are
            // rendered from the file rather than from the grep numbers.
            yield new Uint8Array(
              Buffer.from(Buffer.from('one\ntwo\nthree\n').toString('base64')),
            );
            return;
          }
          yield new Uint8Array(
            Buffer.from(
              './file.txt\u00000:zero\n99999999999999999999:unsafe\n-1:negative\n2:match\n\u0000',
              'utf8',
            ),
          );
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'x', context_lines: 1 },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain(' - file.txt:2: match');
    expect(output.text).toContain('file.txt:1- one');
    expect(output.text).toContain('file.txt:3- three');
    expect(output.text).not.toContain('zero');
    expect(output.text).not.toContain('unsafe');
    expect(output.text).not.toContain('negative');
  });
});

describe('grep_files with a file name that is not a file', () => {
  test('searches every file when a name contains a newline', async () => {
    const session = await createJustBashNetworkSandboxSession();
    const workDir = session.defaultWorkingDirectory;
    // The name is listed as two entries, one of them `-`, which a grep would
    // read as an option or as stdin if the search did not prefix it.
    await session.writeTextFile({
      path: `${workDir}/aaa\n-`,
      content: 'nothing\n',
    });
    await session.writeTextFile({
      path: `${workDir}/real.txt`,
      content: 'needle here\n',
    });
    await session.writeTextFile({
      path: `${workDir}/zzz.txt`,
      content: 'needle there\n',
    });

    const output = await grepFxFiles({
      sandbox: { session, workDir, home: workDir },
      input: { pattern: 'needle' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain(' - real.txt:1: needle here');
    expect(output.text).toContain(' - zzz.txt:1: needle there');
    expect(output.text).not.toContain('not found');
  });

  test('skips a matching line that contains a NUL byte', async () => {
    const session = await createJustBashNetworkSandboxSession();
    const workDir = session.defaultWorkingDirectory;
    await session.writeBinaryFile({
      path: `${workDir}/blob.bin`,
      content: new Uint8Array([0x6e, 0x65, 0x65, 0x64, 0x6c, 0x65, 0x00, 0x0a]),
    });
    await session.writeTextFile({
      path: `${workDir}/text.txt`,
      content: 'needle\n',
    });
    const sandbox = { session, workDir, home: workDir };

    const recursive = await grepFxFiles({
      sandbox,
      input: { pattern: 'needle' },
      abortSignal: new AbortController().signal,
    });
    expect(recursive.text).toContain(' - text.txt:1: needle');
    expect(recursive.text).not.toContain('blob.bin');

    const single = await grepFxFiles({
      sandbox,
      input: { pattern: 'needle', path: 'blob.bin' },
      abortSignal: new AbortController().signal,
    });
    expect(single.text).toContain('no matches for needle');
  });
});

describe('grep_files with a listed name that is not a file of the search', () => {
  test('reports that a listed name could not be searched', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          yield new Uint8Array(
            Buffer.from(
              '../outside.txt\u00001:x\n\u0000./ok.ts\u00001:x\n\u0000',
              'utf8',
            ),
          );
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'x' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain(' - ok.ts:1: x');
    expect(output.text).not.toContain('outside.txt');
    expect(output.text).toContain('a listed name could not be searched');
  });

  test('searches a file named like an ignored directory', async () => {
    const session = await createJustBashNetworkSandboxSession();
    const workDir = session.defaultWorkingDirectory;
    await session.writeTextFile({
      path: `${workDir}/bin/build`,
      content: 'needle in a file named build\n',
    });

    const output = await grepFxFiles({
      sandbox: { session, workDir, home: workDir },
      input: { pattern: 'needle' },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain(' - bin/build:1: needle');
  });
});

describe('grep_files with a file that has more matches than it keeps', () => {
  test('reports the file limit as a lower bound', async () => {
    const { session } = createFakeSearchSession({
      stat: () => ({ type: 'directory', size: 0 }),
      command: () => ({
        chunks: function* () {
          yield new Uint8Array(Buffer.from('./big.ts\u0000', 'utf8'));
          for (let line = 0; line < 2001; line++) {
            yield new Uint8Array(Buffer.from('1:x\n', 'utf8'));
          }
          yield new Uint8Array(Buffer.from('\u0000', 'utf8'));
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'x', head_limit: 1 },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('(showing 1-1 of at least 2000)');
    expect(output.text).toContain('a file has more than 2000 matching lines');
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
          yield new Uint8Array(
            Buffer.from(frame({ path: './big.txt', lines: ['3:needle'] })),
          );
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

  test('reads context of a file that grew after its stat within the limit', async () => {
    const { session, calls, state } = createFakeSearchSession({
      stat: path =>
        path === workDir
          ? { type: 'directory', size: 0 }
          : { type: 'file', size: 1024 },
      command: command => ({
        chunks: function* () {
          if (command.startsWith('base64')) {
            // The file grew to 64 MiB after the stat reported 1 KiB.
            for (;;) {
              yield new Uint8Array(Buffer.alloc(64 * 1024, 0x61));
            }
          }
          yield new Uint8Array(
            Buffer.from(frame({ path: './growth.txt', lines: ['2:needle'] })),
          );
        },
      }),
    });

    const output = await grepFxFiles({
      sandbox: testSandbox(session),
      input: { pattern: 'needle', context_lines: 2 },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain(' - growth.txt:2: needle');
    // The read is bounded, so the grown file has no context lines.
    expect(output.text).not.toContain('growth.txt:1-');
    expect(calls.filter(call => call.startsWith('base64'))).toHaveLength(1);
    expect(state.sent).toBeLessThan(400 * 1024);
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
