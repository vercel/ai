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
 * file, so that the tool's capture is what bounds the read. It fails like a
 * sandbox that cannot run the read, and its whole-file read throws, since
 * the tools must not use one.
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
   * Whether starting the command fails, like an unreachable sandbox.
   */
  spawnFails?: boolean;
  /**
   * Bytes of the file, when they are not the repeated filler line.
   */
  raw?: Uint8Array;
  /**
   * Whether an abort ends the output as if it were complete, like a backend
   * that closes its streams on abort, instead of rejecting `wait`.
   */
  closeOnAbort?: boolean;
  /**
   * Aborts the caller once the output has been pulled this many times.
   */
  cancelAfterChunks?: { chunks: number; abortController: AbortController };
  /**
   * Text the command prints before its output, like a shell profile would.
   */
  noise?: string;
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
  const state = { sent: 0, stopped: 0, kills: 0, pulls: 0 };

  /**
   * Yields the contents of the file.
   *
   * @yields One chunk of the file contents.
   */
  function* contents() {
    if (options.raw != null) {
      for (let offset = 0; offset < options.raw.length; offset += 64 * 1024) {
        yield options.raw.subarray(offset, offset + 64 * 1024);
      }
      return;
    }
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
      if (options.spawnFails) throw new Error('sandbox unavailable');
      /*
       * Models `base64 <path>`: the whole file, encoded in whole three-byte
       * groups so that the pieces decode in order and wrapped like `base64`
       * wraps its lines. Only the tool's capture bounds what the host keeps.
       * A sandbox that refuses the command, like the just-bash sandbox when a
       * command prints more than it may, prints nothing.
       */
      const wrap = (text: string) => `${text.replace(/(.{76})/g, '$1\n')}\n`;
      function* encoded() {
        if (options.fails) return;
        if (options.noise != null) yield Buffer.from(`${options.noise}\n`);
        let pending = Buffer.alloc(0);
        for (const chunk of contents()) {
          if (chunk.length === 0) continue;
          pending = Buffer.concat([pending, Buffer.from(chunk)]);
          const whole = pending.length - (pending.length % 3);
          if (whole > 0) {
            yield Buffer.from(
              wrap(pending.subarray(0, whole).toString('base64')),
            );
            pending = pending.subarray(whole);
          }
        }
        if (pending.length > 0) {
          yield Buffer.from(wrap(pending.toString('base64')));
        }
      }
      const source = encoded();
      const exitCode = options.fails ? 1 : 0;
      let finished = false;
      let drain = () => {};
      const drained = new Promise<void>(resolve => {
        drain = resolve;
      });
      const ended = new Promise<{ exitCode: number }>((resolve, reject) => {
        abortSignal?.addEventListener(
          'abort',
          () => {
            state.stopped++;
            if (options.closeOnAbort) {
              resolve({ exitCode: 0 });
              return;
            }
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
          if (options.cancelAfterChunks != null) {
            state.pulls++;
            if (state.pulls === options.cancelAfterChunks.chunks) {
              options.cancelAfterChunks.abortController.abort(
                new Error('cancelled'),
              );
            }
          }
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
          return Promise.race([drained.then(() => ({ exitCode })), ended]);
        },
        async kill() {
          state.stopped++;
          state.kills++;
        },
      };
    },
    async readBinaryFile() {
      calls.push('readBinaryFile');
      // A whole-file read is what the tools must not do, whatever a stat
      // reported: a file can grow or be replaced before the read.
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

  test('reports a read the sandbox refuses instead of reading the file', async () => {
    const { session, calls } = createFakeFileSession({
      size: 12 * MIB,
      fails: true,
    });

    await expect(
      readFxFile({
        sandbox: sandbox(session),
        input: { path: 'big.txt', start_line: 1, line_count: 3 },
        abortSignal,
      }),
    ).rejects.toThrow(
      'could not read /home/user/big.txt: the sandbox could not run the bounded read',
    );
    expect(calls).toEqual(['stat', `spawn base64 '/home/user/big.txt'`]);
  });

  test('does not use output that is not base64 as the file', async () => {
    const { session, calls } = createFakeFileSession({
      size: 12 * MIB,
      noise: 'warning: something printed before the read',
    });

    await expect(
      readFxFile({
        sandbox: sandbox(session),
        input: { path: 'big.txt', start_line: 1, line_count: 3 },
        abortSignal,
      }),
    ).rejects.toThrow('the sandbox could not run the bounded read');
    expect(calls).toEqual(['stat', `spawn base64 '/home/user/big.txt'`]);
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

  test('reports a large file on a sandbox that cannot run the read', async () => {
    const justBash = await createJustBashNetworkSandboxSession();
    const workDir = justBash.defaultWorkingDirectory;
    const line = `${'x'.repeat(998)}\n`;
    // One byte past the snapshot limit, so the encoded read is refused and
    // the tool reports it instead of reading the file as a whole.
    const content = Buffer.from(
      line.repeat(Math.ceil((10 * MIB + 1) / line.length)),
    ).subarray(0, 10 * MIB + 1);
    await justBash.writeBinaryFile({
      path: `${workDir}/big.txt`,
      content: new Uint8Array(content),
    });

    // The sandbox caps what a command may print, so the encoded read of a
    // file this size is refused, and the tool reports that rather than
    // reading the whole file.
    await expect(
      readFxFile({
        sandbox: { session: justBash, workDir, home: workDir },
        input: { path: 'big.txt', start_line: 1, line_count: 2 },
        abortSignal,
      }),
    ).rejects.toThrow('the sandbox could not run the bounded read');
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

    expect(calls).toEqual(['stat', 'spawn']);
  });
});

describe('a file that grew after its stat', () => {
  test('keeps a read_file snapshot bounded', async () => {
    const { session, state } = createFakeFileSession({
      size: 1024,
      contentBytes: 64 * MIB,
    });

    const output = await readFxFile({
      sandbox: {
        session,
        workDir: '/home/user',
        home: '/home/user',
      },
      input: { path: 'growth.txt', start_line: 1, line_count: 3 },
      abortSignal: new AbortController().signal,
    });

    expect(output.text).toContain('file snapshot was capped before EOF');
    // The stat said 1 KiB, and the host still kept only a snapshot.
    expect(state.sent).toBeLessThan(15 * MIB);
    expect(state.stopped).toBeGreaterThan(0);
  });

  test('keeps an edit_file preimage bounded', async () => {
    const { session, state } = createFakeFileSession({
      size: 1024,
      contentBytes: 64 * MIB,
    });

    const output = await editFxFile({
      sandbox: {
        session,
        workDir: '/home/user',
        home: '/home/user',
      },
      input: { path: 'growth.txt', old_string: 'a', new_string: 'b' },
      abortSignal: new AbortController().signal,
    });

    expect(output).toEqual({
      text: 'file mutation preparation failed: preimage exceeds the 4 MiB preparation limit',
      isError: true,
    });
    expect(state.sent).toBeLessThan(7 * MIB);
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

describe('a read the sandbox refuses', () => {
  test('reports an edit_file preimage it cannot read', async () => {
    const { session } = createFakeFileSession({ size: 1024, fails: true });

    const output = await editFxFile({
      sandbox: { session, workDir: '/home/user', home: '/home/user' },
      input: { path: 'file.txt', old_string: 'a', new_string: 'b' },
      abortSignal: new AbortController().signal,
    });

    expect(output).toEqual({
      text: 'file mutation preparation failed: unable to read the approved preimage',
      isError: true,
    });
  });

  test('writes a file it cannot compare', async () => {
    const { session, calls } = createFakeFileSession({ size: 12, fails: true });

    const output = await writeFxFile({
      sandbox: { session, workDir: '/home/user', home: '/home/user' },
      input: { path: 'file.txt', content: 'replacement\n' },
      abortSignal: new AbortController().signal,
    });

    expect(calls).toContain('writeTextFile');
    expect(output).toEqual({ text: 'wrote file.txt (12 bytes)' });
  });

  test('reports a read_file the sandbox cannot start', async () => {
    const { session } = createFakeFileSession({
      size: 1024,
      spawnFails: true,
    });

    await expect(
      readFxFile({
        sandbox: { session, workDir: '/home/user', home: '/home/user' },
        input: { path: 'file.txt' },
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow('the sandbox could not run the bounded read');
  });
});

describe('a snapshot that stops inside a character', () => {
  test('shows the text before the cut', async () => {
    // Three-byte characters throughout, so a snapshot that stops near the
    // limit stops inside one of them.
    const raw = Buffer.from('€'.repeat(3.5 * MIB));
    const { session } = createFakeFileSession({
      size: raw.length,
      raw: new Uint8Array(raw),
    });

    const output = await readFxFile({
      sandbox: { session, workDir: '/home/user', home: '/home/user' },
      input: { path: 'text.txt', start_line: 1, line_count: 1 },
      abortSignal: new AbortController().signal,
    });

    // The two bytes of `é` straddle the snapshot limit, so the snapshot is
    // cut before them rather than inside them.
    expect(output.text).not.toContain('binary or non-utf8');
    expect(output.text).toContain('file snapshot was capped before EOF');
  });
});

describe('a sandbox that cannot start a read', () => {
  test('reports an edit_file preimage it cannot read', async () => {
    const { session } = createFakeFileSession({
      size: 1024,
      spawnFails: true,
    });

    const output = await editFxFile({
      sandbox: { session, workDir: '/home/user', home: '/home/user' },
      input: { path: 'file.txt', old_string: 'a', new_string: 'b' },
      abortSignal: new AbortController().signal,
    });

    expect(output).toEqual({
      text: 'file mutation preparation failed: unable to read the approved preimage',
      isError: true,
    });
  });
});

describe('a read the caller stops', () => {
  test('stops the command it no longer reads', async () => {
    const { session, state } = createFakeFileSession({
      size: 64 * MIB,
      contentBytes: 64 * MIB,
    });

    await readFxFile({
      sandbox: { session, workDir: '/home/user', home: '/home/user' },
      input: { path: 'big.txt' },
      abortSignal: new AbortController().signal,
    });

    expect(state.kills).toBeGreaterThan(0);
  });

  test('reports an abort even when the sandbox ends its output cleanly', async () => {
    const controller = new AbortController();
    const { session } = createFakeFileSession({
      size: 64 * MIB,
      contentBytes: 64 * MIB,
      closeOnAbort: true,
      cancelAfterChunks: { chunks: 2, abortController: controller },
    });

    await expect(
      readFxFile({
        sandbox: { session, workDir: '/home/user', home: '/home/user' },
        input: { path: 'big.txt' },
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow('cancelled');
  });
});
