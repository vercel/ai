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
