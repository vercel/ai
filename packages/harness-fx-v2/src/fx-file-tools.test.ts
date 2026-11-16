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
  test('reports no change for a file with non-ASCII text', async () => {
    const { session, workDir, sandbox, abortSignal } = await setup();
    await session.writeTextFile({
      path: `${workDir}/notes.txt`,
      content: 'caf\u00e9 \u20ac\n',
    });

    expect(
      await writeFxFile({
        sandbox,
        input: { path: 'notes.txt', content: 'caf\u00e9 \u20ac\n' },
        abortSignal,
      }),
    ).toEqual({
      text: 'No changes to notes.txt; it already contains the requested content',
    });
  });

  test('writes a file that is not valid UTF-8', async () => {
    const { session, workDir, sandbox, abortSignal } = await setup();
    await session.writeBinaryFile({
      path: `${workDir}/latin1.txt`,
      content: Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x0a]),
    });

    expect(
      await writeFxFile({
        sandbox,
        input: { path: 'latin1.txt', content: 'cafe\n' },
        abortSignal,
      }),
    ).toEqual({ text: 'wrote latin1.txt (5 bytes)' });
    expect(await session.readTextFile({ path: `${workDir}/latin1.txt` })).toBe(
      'cafe\n',
    );
  });

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
  test('edits a file with non-ASCII text through the bounded read', async () => {
    const { session, workDir, sandbox, abortSignal } = await setup();
    await session.writeTextFile({
      path: `${workDir}/file.txt`,
      content: 'caf\u00e9 \u20ac\n',
    });

    const output = await editFxFile({
      sandbox,
      input: { path: 'file.txt', old_string: '\u20ac', new_string: 'EUR' },
      abortSignal,
    });

    expect(output).toEqual({ text: 'edited file.txt (10 bytes)' });
    expect(await session.readTextFile({ path: `${workDir}/file.txt` })).toBe(
      'caf\u00e9 EUR\n',
    );
  });

  test('refuses a preimage that is not valid UTF-8', async () => {
    const { session, workDir, sandbox, abortSignal } = await setup();
    // 'café\n' in Latin-1, so that the preimage keeps a byte that is not
    // valid UTF-8.
    await session.writeBinaryFile({
      path: `${workDir}/latin1.txt`,
      content: Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x0a]),
    });

    expect(
      await editFxFile({
        sandbox,
        input: { path: 'latin1.txt', old_string: 'caf', new_string: 'dog' },
        abortSignal,
      }),
    ).toEqual({
      text: 'file mutation preparation failed: unable to read the approved preimage',
      isError: true,
    });
  });

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
 * the encoded read the tools use for a bounded read and streams the whole
 * file, so that the tool's capture is what bounds the read, and
 * `readBinaryFile` returns the whole file for a sandbox that cannot run it.
 */
function createFakeFileSession(options: {
  size: number;
  /**
   * Size of the bytes a read returns, when a file grew past its stat.
   */
  contentBytes?: number;
  /**
   * Whether the command fails, like `base64` on a file it cannot read.
   */
  fails?: boolean;
  /**
   * Bytes at the start of the file, before the filler lines.
   */
  prefix?: Uint8Array;
  /**
   * Length of each filler line, including its newline.
   */
  lineLength?: number;
}) {
  const {
    size,
    contentBytes = size,
    prefix = new Uint8Array(),
    lineLength = 999,
  } = options;
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
    while (written < contentBytes) {
      const length = Math.min(64 * 1024, contentBytes - written);
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
      /*
       * Models `base64 <path>`: the whole file, encoded in whole three-byte
       * groups so that the pieces decode in order. Only the tool's capture
       * bounds what the host keeps. A sandbox that refuses the command, like
       * the just-bash sandbox when a command prints more than it may, prints
       * nothing.
       */
      function* encoded() {
        if (options.fails) return;
        let pending = Buffer.alloc(0);
        for (const chunk of contents()) {
          if (chunk.length === 0) continue;
          pending = Buffer.concat([pending, Buffer.from(chunk)]);
          const whole = pending.length - (pending.length % 3);
          if (whole > 0) {
            yield Buffer.from(pending.subarray(0, whole).toString('base64'));
            pending = pending.subarray(whole);
          }
        }
        if (pending.length > 0) yield Buffer.from(pending.toString('base64'));
      }
      const source = encoded();
      const exitCode = options.fails ? 1 : 0;
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
          const { done, value } = source.next();
          if (done) {
            if (!finished) {
              finished = true;
              drain();
            }
            controller.close();
            return;
          }
          state.sent += value.length;
          controller.enqueue(new Uint8Array(value));
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
          return Promise.race([drained.then(() => ({ exitCode })), aborted]);
        },
        async kill() {
          state.stopped++;
        },
      };
    },
    async readBinaryFile() {
      calls.push('readBinaryFile');
      const bytes = Buffer.concat([
        Buffer.from(prefix),
        Buffer.alloc(size - prefix.length, 0x78),
      ]);
      return new Uint8Array(bytes);
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
    const { session, calls, state } = createFakeFileSession({ size: 20 * MIB });

    const output = await readFxFile({
      sandbox: sandbox(session),
      input: { path: 'big.txt', start_line: 1, line_count: 3 },
      abortSignal,
    });

    expect(calls).toEqual(['stat', `spawn base64 '/home/user/big.txt'`]);
    expect(output.text).toContain('1\txxx');
    expect(output.text).toContain('file snapshot was capped before EOF');
    // The sandbox sent the whole file, and the host stopped reading it.
    expect(state.sent).toBeLessThan(15 * MIB);
  });

  test('keeps the snapshot bounded when the sandbox sends the whole file', async () => {
    const { session, state } = createFakeFileSession({
      size: 64 * MIB,
    });

    const output = await readFxFile({
      sandbox: sandbox(session),
      input: { path: 'big.txt', start_line: 1, line_count: 3 },
      abortSignal,
    });

    expect(output.text).toContain('file snapshot was capped before EOF');
    // The host kept a snapshot, not the 64 MiB stream the sandbox sent.
    expect(state.sent).toBeLessThan(15 * MIB);
    expect(state.stopped).toBeGreaterThan(0);
  });

  test('reads a bounded file as a whole when the sandbox refuses the command', async () => {
    const { session, calls } = createFakeFileSession({
      size: 12 * MIB,
      fails: true,
    });

    const output = await readFxFile({
      sandbox: sandbox(session),
      input: { path: 'big.txt', start_line: 1, line_count: 3 },
      abortSignal,
    });

    expect(calls).toEqual([
      'stat',
      `spawn base64 '/home/user/big.txt'`,
      'readBinaryFile',
    ]);
    expect(output.text).toContain('file snapshot was capped before EOF');
  });

  test('does not download a huge file when the sandbox refuses the command', async () => {
    const { session, calls } = createFakeFileSession({
      size: 64 * MIB,
      fails: true,
    });

    await expect(
      readFxFile({
        sandbox: sandbox(session),
        input: { path: 'huge.txt' },
        abortSignal,
      }),
    ).rejects.toThrow(
      'could not read /home/user/huge.txt: the sandbox could not run the bounded read',
    );
    expect(calls).toEqual(['stat', `spawn base64 '/home/user/huge.txt'`]);
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

    expect(calls).toEqual(['stat', `spawn base64 '/home/user/big.png'`]);
    expect(output.text).toBe(
      "<path>big.png</path>\n<content>image not attached: image/png (12582912 bytes); the file exceeds read_file's 10 MiB read limit. Use an available image tool to save a smaller copy to a new file, then read_file the copy. If no image tool is available, ask the user before installing one.</content>",
    );
  });

  test('reads a snapshot of a large file on the just-bash backend', async () => {
    const justBash = await createJustBashNetworkSandboxSession();
    const workDir = justBash.defaultWorkingDirectory;
    const line = `${'x'.repeat(998)}\n`;
    // One byte past the snapshot limit, so the encoded read is refused and
    // the whole-file fallback has to keep the result capped.
    const content = Buffer.from(
      line.repeat(Math.ceil((10 * MIB + 1) / line.length)),
    ).subarray(0, 10 * MIB + 1);
    await justBash.writeBinaryFile({
      path: `${workDir}/big.txt`,
      content: new Uint8Array(content),
    });

    const output = await readFxFile({
      sandbox: { session: justBash, workDir, home: workDir },
      input: { path: 'big.txt', start_line: 1, line_count: 2 },
      abortSignal,
    });

    expect(output.text).toContain('1\txxx');
    expect(output.text).toContain('file snapshot was capped before EOF');
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
  test('rejects a file that grew past its stat within the limit', async () => {
    const { session, calls, state } = createFakeFileSession({
      size: 4 * 1024,
      contentBytes: 64 * MIB,
    });
    const sandbox: FxToolSandbox = {
      session,
      workDir: '/home/user',
      home: '/home/user',
    };

    const output = await editFxFile({
      sandbox,
      input: { path: 'growth.txt', old_string: 'needle', new_string: 'other' },
      abortSignal: new AbortController().signal,
    });

    expect(calls).toEqual(['stat', `spawn base64 '/home/user/growth.txt'`]);
    expect(output).toEqual({
      text: 'file mutation preparation failed: preimage exceeds the 4 MiB preparation limit',
      isError: true,
    });
    expect(state.sent).toBeLessThan(7 * MIB);
  });

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
  test('compares a file that grew past its stat within the limit', async () => {
    const { session, state } = createFakeFileSession({
      size: 12,
      contentBytes: 64 * MIB,
    });
    const sandbox: FxToolSandbox = {
      session,
      workDir: '/home/user',
      home: '/home/user',
    };

    const output = await writeFxFile({
      sandbox,
      input: { path: 'growth.txt', content: 'replacement\n' },
      abortSignal: new AbortController().signal,
    });

    expect(output).toEqual({ text: 'wrote growth.txt (12 bytes)' });
    expect(state.sent).toBeLessThan(MIB);
  });

  test('writes without reading a file of another size', async () => {
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
