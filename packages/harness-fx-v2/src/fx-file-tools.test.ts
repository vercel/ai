import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, test } from 'vitest';
import type { FxToolSandbox } from './fx-builtin-tools';
import {
  detectImageMediaType,
  editFxFile,
  readFxFile,
  writeFxFile,
} from './fx-file-tools';

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

async function setup() {
  const session = await createJustBashNetworkSandboxSession();
  const workDir = session.defaultWorkingDirectory;
  const sandbox: FxToolSandbox = { session, workDir, home: workDir };
  const abortSignal = new AbortController().signal;
  return { session, workDir, sandbox, abortSignal };
}

describe('detectImageMediaType', () => {
  test('detects PNG bytes and ignores text', () => {
    expect(detectImageMediaType({ bytes: PNG_BYTES })).toBe('image/png');
    expect(
      detectImageMediaType({ bytes: new TextEncoder().encode('hello') }),
    ).toBeUndefined();
  });
});

describe('readFxFile', () => {
  test('returns numbered lines', async () => {
    const { session, workDir, sandbox, abortSignal } = await setup();
    await session.writeTextFile({
      path: `${workDir}/notes.txt`,
      content: 'one\ntwo\nthree\n',
    });

    expect(
      await readFxFile({ sandbox, input: { path: 'notes.txt' }, abortSignal }),
    ).toMatchInlineSnapshot(`
      {
        "text": "<path>notes.txt</path>
      <content>
      1	one
      2	two
      3	three
      </content>",
      }
    `);
  });

  test('returns the requested line range with a notice', async () => {
    const { session, workDir, sandbox, abortSignal } = await setup();
    await session.writeTextFile({
      path: `${workDir}/notes.txt`,
      content: 'one\ntwo\nthree\nfour\n',
    });

    expect(
      await readFxFile({
        sandbox,
        input: { path: 'notes.txt', start_line: 2, line_count: 2 },
        abortSignal,
      }),
    ).toMatchInlineSnapshot(`
      {
        "text": "<path>notes.txt</path>
      <content>
      2	two
      3	three
      ... [showing 2 of 4 lines; use start_line/line_count to read more.]
      </content>",
      }
    `);
  });

  test('reports a missing file as an error result', async () => {
    const { sandbox, abortSignal } = await setup();

    expect(
      await readFxFile({
        sandbox,
        input: { path: 'missing.txt' },
        abortSignal,
      }),
    ).toMatchInlineSnapshot(`
      {
        "isError": true,
        "text": "{"error":{"type":"tool_execution_failed","tool_name":"read_file","message":"read_file failed","details":{"field":"path","path":"/home/user/missing.txt","error":"FileNotFound"},"suggestion":"Run glob_files to discover matching paths, or check the path relative to the workspace."}}",
      }
    `);
  });

  test('attaches an image', async () => {
    const { session, workDir, sandbox, abortSignal } = await setup();
    await session.writeBinaryFile({
      path: `${workDir}/pixel.png`,
      content: PNG_BYTES,
    });

    expect(
      await readFxFile({ sandbox, input: { path: 'pixel.png' }, abortSignal }),
    ).toMatchInlineSnapshot(`
      {
        "images": [
          {
            "data": "iVBORw0KGgoAAA==",
            "mediaType": "image/png",
          },
        ],
        "text": "<path>pixel.png</path>
      <content>image attached (image/png, 10 bytes)</content>",
      }
    `);
  });
});

describe('writeFxFile', () => {
  test('creates a file with its parent directories', async () => {
    const { session, workDir, sandbox, abortSignal } = await setup();

    const output = await writeFxFile({
      sandbox,
      input: { path: 'nested/dir/file.txt', content: 'hello\n' },
      abortSignal,
    });

    expect(output).toMatchInlineSnapshot(`
      {
        "text": "wrote nested/dir/file.txt (6 bytes)",
      }
    `);
    expect(
      await session.readTextFile({ path: `${workDir}/nested/dir/file.txt` }),
    ).toBe('hello\n');
  });
});

describe('editFxFile', () => {
  test('replaces a unique match', async () => {
    const { session, workDir, sandbox, abortSignal } = await setup();
    await session.writeTextFile({
      path: `${workDir}/file.txt`,
      content: 'alpha\nbeta\n',
    });

    const output = await editFxFile({
      sandbox,
      input: { path: 'file.txt', old_string: 'beta', new_string: 'gamma' },
      abortSignal,
    });

    expect(output).toMatchInlineSnapshot(`
      {
        "text": "edited file.txt (12 bytes)",
      }
    `);
    expect(await session.readTextFile({ path: `${workDir}/file.txt` })).toBe(
      'alpha\ngamma\n',
    );
  });

  test('reports a missing and an ambiguous match as error results', async () => {
    const { session, workDir, sandbox, abortSignal } = await setup();
    await session.writeTextFile({
      path: `${workDir}/file.txt`,
      content: 'same\nsame\n',
    });

    expect(
      await editFxFile({
        sandbox,
        input: { path: 'file.txt', old_string: 'other', new_string: 'x' },
        abortSignal,
      }),
    ).toMatchInlineSnapshot(`
      {
        "isError": true,
        "text": "edit_file failed: old_string not found in file. Re-read the file to see its current contents; if the change is already applied, do not retry this edit.",
      }
    `);
    expect(
      await editFxFile({
        sandbox,
        input: { path: 'file.txt', old_string: 'same', new_string: 'x' },
        abortSignal,
      }),
    ).toMatchInlineSnapshot(`
      {
        "isError": true,
        "text": "edit_file failed: old_string is not unique (found 2 occurrences), provide more context",
      }
    `);
    expect(await session.readTextFile({ path: `${workDir}/file.txt` })).toBe(
      'same\nsame\n',
    );
  });
});

/**
 * Fake sandbox session for one file, so a test controls the file's reported
 * size and its contents, and records the calls the tools make. `spawn` runs
 * the `head` command the tools use for a bounded read and streams at most
 * the bytes it asks for, unless `ignoreLimit` makes it fail to do so.
 */
function createFakeFileSession(options: {
  size: number;
  /**
   * Bytes at the start of the file, before the filler lines.
   */
  prefix?: Uint8Array;
  /**
   * Length of each filler line, including its newline.
   */
  lineLength?: number;
  /**
   * Whether the fake sandbox ignores the byte limit of `head -c`.
   */
  ignoreLimit?: boolean;
}) {
  const { size, prefix = new Uint8Array(), lineLength = 999 } = options;
  const line = `${'x'.repeat(lineLength - 1)}\n`;
  const calls: string[] = [];
  const state = { sent: 0, stopped: 0 };

  /**
   * Yields the contents of the file.
   *
   * @yields One chunk of the file contents.
   */
  function* contents() {
    yield prefix;
    let written = prefix.length;
    while (written < size) {
      const length = Math.min(64 * 1024, size - written);
      const text = line.repeat(Math.ceil(length / line.length));
      yield new Uint8Array(Buffer.from(text, 'utf8').subarray(0, length));
      written += length;
    }
  }

  // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- partial sandbox session for a test.
  const session = {
    description: 'fake sandbox',
    async stat() {
      calls.push('stat');
      return { type: 'file', size };
    },
    async spawn({
      command,
      abortSignal,
    }: {
      command: string;
      abortSignal?: AbortSignal;
    }) {
      calls.push(`spawn ${command}`);
      const asked = Number(/head -c (\d+)/.exec(command)?.[1]);
      const limit = options.ignoreLimit ? Number.POSITIVE_INFINITY : asked;
      const source = contents();
      let finished = false;
      let drain = () => {};
      const drained = new Promise<void>(resolve => {
        drain = resolve;
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
      const stdout = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (state.sent >= limit) {
            if (!finished) {
              finished = true;
              drain();
            }
            controller.close();
            return;
          }
          const { done, value } = source.next();
          if (done) {
            if (!finished) {
              finished = true;
              drain();
            }
            controller.close();
            return;
          }
          const take = Math.min(limit - state.sent, value.length);
          const chunk = take === value.length ? value : value.slice(0, take);
          state.sent += chunk.length;
          controller.enqueue(chunk);
        },
      });
      return {
        stdout,
        stderr: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
        async wait() {
          return Promise.race([drained.then(() => ({ exitCode: 0 })), aborted]);
        },
        async kill() {
          state.stopped++;
        },
      };
    },
    async readBinaryFile() {
      calls.push('readBinaryFile');
      throw new Error('readBinaryFile must not be called');
    },
    async readFile() {
      calls.push('readFile');
      throw new Error('readFile must not be called');
    },
    async writeTextFile() {
      calls.push('writeTextFile');
    },
    async writeBinaryFile() {
      calls.push('writeBinaryFile');
    },
  } as unknown as FxToolSandbox['session'];
  return { session, calls, state };
}

const MIB = 1024 * 1024;

describe('readFxFile with a file larger than a snapshot', () => {
  const abortSignal = new AbortController().signal;
  const sandbox = (session: FxToolSandbox['session']): FxToolSandbox => ({
    session,
    workDir: '/home/user',
    home: '/home/user',
  });

  test('reads a snapshot of the file with a bounded command', async () => {
    const { session, calls } = createFakeFileSession({ size: 20 * MIB });

    const output = await readFxFile({
      sandbox: sandbox(session),
      input: { path: 'big.txt', start_line: 1, line_count: 3 },
      abortSignal,
    });

    expect(calls).toEqual([
      'stat',
      `spawn head -c ${10 * MIB + 1} -- '/home/user/big.txt'`,
    ]);
    expect(output.text).toContain('1\txxx');
    expect(output.text).toContain('file snapshot was capped before EOF');
  });

  test('keeps the snapshot bounded when the sandbox ignores the limit', async () => {
    const { session, state } = createFakeFileSession({
      size: 64 * MIB,
      ignoreLimit: true,
    });

    const output = await readFxFile({
      sandbox: sandbox(session),
      input: { path: 'big.txt', start_line: 1, line_count: 3 },
      abortSignal,
    });

    expect(output.text).toContain('file snapshot was capped before EOF');
    // The host kept a snapshot, not the 64 MiB stream the sandbox sent.
    expect(state.sent).toBeLessThan(11 * MIB);
    expect(state.stopped).toBeGreaterThan(0);
  });

  test('names the size of an image it does not attach', async () => {
    const { session, calls } = createFakeFileSession({
      size: 12 * MIB,
      prefix: PNG_BYTES,
    });

    const output = await readFxFile({
      sandbox: sandbox(session),
      input: { path: 'big.png' },
      abortSignal,
    });

    expect(calls).toEqual([
      'stat',
      `spawn head -c ${10 * MIB + 1} -- '/home/user/big.png'`,
    ]);
    expect(output.text).toBe(
      "<path>big.png</path>\n<content>image not attached: image/png (12582912 bytes); the file exceeds read_file's 10 MiB read limit. Use an available image tool to save a smaller copy to a new file, then read_file the copy. If no image tool is available, ask the user before installing one.</content>",
    );
  });

  test('reads a file within the snapshot limit as a whole', async () => {
    const justBash = await createJustBashNetworkSandboxSession();
    const workDir = justBash.defaultWorkingDirectory;
    await justBash.writeTextFile({
      path: `${workDir}/notes.txt`,
      content: 'one\ntwo\n',
    });
    const calls: string[] = [];
    const session = new Proxy(justBash, {
      // oxlint-disable-next-line ai-sdk/require-object-parameter -- `Proxy` handler signature.
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          calls.push(String(property));
          return value.apply(target, args);
        };
      },
    });

    await readFxFile({
      sandbox: { session, workDir, home: workDir },
      input: { path: 'notes.txt' },
      abortSignal,
    });

    expect(calls).toEqual(['stat', 'readBinaryFile']);
  });
});

describe('editFxFile with a preimage larger than the limit', () => {
  test('rejects the file without reading it', async () => {
    const { session, calls } = createFakeFileSession({ size: 20 * MIB });
    const sandbox: FxToolSandbox = {
      session,
      workDir: '/home/user',
      home: '/home/user',
    };

    const output = await editFxFile({
      sandbox,
      input: { path: 'big.txt', old_string: 'needle', new_string: 'other' },
      abortSignal: new AbortController().signal,
    });

    expect(calls).toEqual(['stat']);
    expect(output).toEqual({
      text: 'file mutation preparation failed: preimage exceeds the 4 MiB preparation limit',
      isError: true,
    });
  });
});

describe('writeFxFile over a file of another size', () => {
  test('writes without reading the existing file', async () => {
    const { session, calls } = createFakeFileSession({ size: 20 * MIB });
    const sandbox: FxToolSandbox = {
      session,
      workDir: '/home/user',
      home: '/home/user',
    };

    const output = await writeFxFile({
      sandbox,
      input: { path: 'big.txt', content: 'replacement\n' },
      abortSignal: new AbortController().signal,
    });

    expect(calls).toEqual(['stat', 'writeTextFile']);
    expect(output).toEqual({ text: 'wrote big.txt (12 bytes)' });
  });
});
