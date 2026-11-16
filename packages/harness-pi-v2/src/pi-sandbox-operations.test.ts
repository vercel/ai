import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, test } from 'vitest';
import {
  createPiSandboxOperations,
  detectImageMimeType,
  expandSandboxHome,
  findSandboxFiles,
} from './pi-sandbox-operations';

async function setup() {
  const session = await createJustBashNetworkSandboxSession();
  const root = session.defaultWorkingDirectory;
  await session.writeTextFile({ path: `${root}/src/a.ts`, content: 'a' });
  await session.writeTextFile({ path: `${root}/src/b.test.ts`, content: 'b' });
  await session.writeTextFile({ path: `${root}/README.md`, content: 'r' });
  await session.writeTextFile({
    path: `${root}/node_modules/x/index.ts`,
    content: 'x',
  });
  return { session, root, operations: createPiSandboxOperations({ session }) };
}

describe('createPiSandboxOperations', () => {
  test('reads, writes and inspects files', async () => {
    const { root, operations } = await setup();

    await operations.mkdir(`${root}/new/dir`);
    await operations.writeFile(`${root}/new/dir/file.txt`, 'content');

    expect(
      (await operations.readFile(`${root}/new/dir/file.txt`)).toString(),
    ).toBe('content');
    await expect(operations.access(`${root}/missing`)).rejects.toThrow(
      'ENOENT',
    );
    expect(await operations.exists(`${root}/new`)).toBe(true);
    expect(await operations.exists(`${root}/missing`)).toBe(false);
    expect((await operations.stat(`${root}/new`)).isDirectory()).toBe(true);
    expect((await operations.readdir(`${root}/src`)).sort()).toEqual([
      'a.ts',
      'b.test.ts',
    ]);
    expect(await operations.detectImageMimeType!(`${root}/README.md`)).toBe(
      undefined,
    );
    expect((await operations.readFile(`${root}/README.md`)).toString()).toBe(
      'r',
    );
  });

  test('detects an image and refuses an oversized one', async () => {
    const { session, root, operations } = await setup();
    const header = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    await session.writeBinaryFile({
      path: `${root}/small.png`,
      content: header,
    });

    // Image detection reads through the same bounded read as the read tool.
    expect(await operations.detectImageMimeType!(`${root}/small.png`)).toBe(
      'image/png',
    );
    expect((await operations.readFile(`${root}/small.png`)).byteLength).toBe(8);

    const large = new Uint8Array(10 * 1024 * 1024 + 1);
    large.set(header);
    await session.writeBinaryFile({
      path: `${root}/large.png`,
      content: large,
    });

    await expect(
      operations.detectImageMimeType!(`${root}/large.png`),
    ).rejects.toThrow('File is too large to read');
  });

  test('does not reuse a size from a stat after the file has grown', async () => {
    const { session, root, operations } = await setup();
    const limit = 10 * 1024 * 1024;
    await session.writeTextFile({
      path: `${root}/grows.log`,
      content: 'small',
    });
    // `ls` stats entries, and its last stat must not be trusted by a read.
    await operations.stat(`${root}/grows.log`);
    await session.writeTextFile({
      path: `${root}/grows.log`,
      content: 'a'.repeat(limit + 1),
    });

    await expect(operations.readFile(`${root}/grows.log`)).rejects.toThrow(
      'File is too large to read',
    );
  });

  test('refuses a file that grew after its stat, without holding it', async () => {
    /*
     * A sandbox process grows the file between the stat that the read checks
     * and the read itself, so the size the host sees is far below what the
     * reads serve.
     */
    const limit = 10 * 1024 * 1024;
    const encodedLength = Math.ceil((40 * 1024 * 1024) / 3) * 4;
    const state = { served: 0 };
    const session = {
      description: 'growing file sandbox',
      async stat() {
        return { type: 'file' as const, size: 4 };
      },
      async run({ command }: { command: string }) {
        if (command.includes('wc -c')) {
          return { exitCode: 0, stdout: `${encodedLength}\n`, stderr: '' };
        }
        const size = Number(/tail -c (\d+)/.exec(command)?.[1] ?? 0);
        // Valid base64 of the requested length, so the read decodes it.
        const encoded = 'QUFB'.repeat(Math.ceil(size / 4)).slice(0, size);
        state.served += encoded.length;
        return { exitCode: 0, stdout: encoded, stderr: '' };
      },
    };
    // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- partial sandbox session for a test.
    const operations = createPiSandboxOperations({ session: session as never });

    await expect(operations.readFile('/home/user/grows.log')).rejects.toThrow(
      'File is too large to read: /home/user/grows.log is larger than the limit',
    );
    // The host stopped as soon as the limit was passed, well before the 40 MiB
    // the file would encode to.
    expect(state.served).toBeLessThan(encodedLength / 2);
    expect(state.served).toBeLessThan(4 * limit);
  });

  test('reports a file that changed while it was read', async () => {
    const encoded = 8 * 1024 * 1024;
    const session = {
      description: 'shrinking file sandbox',
      async stat() {
        return { type: 'file' as const, size: 4 * 1024 * 1024 };
      },
      async run(options: { command: string }) {
        if (options.command.includes('wc -c')) {
          return { exitCode: 0, stdout: `${encoded}\n`, stderr: '' };
        }
        // The file shrank after its length was read.
        return { exitCode: 0, stdout: 'QUFB', stderr: '' };
      },
    };
    const operations = createPiSandboxOperations({
      // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- partial sandbox session for a test.
      session: session as never,
    });

    await expect(operations.readFile('/home/user/log.txt')).rejects.toThrow(
      'the file changed while it was read',
    );
  });

  test('reports a missing file that the sandbox cannot read', async () => {
    const session = {
      description: 'missing file sandbox',
      async stat() {
        return null;
      },
      async run() {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'base64: no such file or directory',
        };
      },
    };
    const operations = createPiSandboxOperations({
      // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- partial sandbox session for a test.
      session: session as never,
    });

    await expect(operations.readFile('/home/user/missing.txt')).rejects.toThrow(
      'ENOENT',
    );
  });

  test('reads binary content byte for byte', async () => {
    const { session, root, operations } = await setup();
    const bytes = new Uint8Array(4096);
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = index % 256;
    }
    await session.writeBinaryFile({ path: `${root}/bin.dat`, content: bytes });

    const read = await operations.readFile(`${root}/bin.dat`);

    expect(Buffer.compare(Buffer.from(read), Buffer.from(bytes))).toBe(0);
  });

  test('refuses to read a directory', async () => {
    const { root, operations } = await setup();

    await expect(operations.readFile(`${root}/src`)).rejects.toThrow('EISDIR');
  });

  test('refuses to read a file above the size limit', async () => {
    const { session, root, operations } = await setup();
    const limit = 10 * 1024 * 1024;
    await session.writeTextFile({
      path: `${root}/large.log`,
      content: 'a'.repeat(limit + 1),
    });
    await session.writeTextFile({
      path: `${root}/at-limit.log`,
      content: 'a'.repeat(limit),
    });

    await expect(operations.readFile(`${root}/large.log`)).rejects.toThrow(
      'File is too large to read: ',
    );
    expect((await operations.readFile(`${root}/at-limit.log`)).byteLength).toBe(
      limit,
    );
  });
});

describe('findSandboxFiles', () => {
  test('matches file names for patterns without a slash', async () => {
    const { session, root } = await setup();

    expect(
      await findSandboxFiles({
        session,
        pattern: '*.ts',
        directory: root,
        ignore: ['**/node_modules/**'],
        limit: 10,
      }),
    ).toEqual(['src/a.ts', 'src/b.test.ts']);
  });

  test('bounds the enumeration of a tree that a sandbox user filled', async () => {
    const line = `${'d'.repeat(200)}/file.txt\n`;
    let command = '';
    const session = {
      description: 'huge tree sandbox',
      async run(options: { command: string }) {
        command = options.command;
        // What the capped command prints for a tree far above the budget.
        return {
          exitCode: 0,
          stdout: line.repeat(Math.ceil((5 * 1024 * 1024) / line.length)),
          stderr: '',
        };
      },
    };

    const paths = await findSandboxFiles({
      // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- partial sandbox session for a test.
      session: session as never,
      pattern: '*.txt',
      directory: '/home/user',
      ignore: ['**/node_modules/**'],
      limit: 3,
    });

    // The sandbox stops the enumeration, so the host never holds the tree.
    expect(command).toContain(`-name 'node_modules'`);
    expect(command).toContain('-prune');
    expect(command).toContain('head -n 50001');
    expect(command).toContain(`head -c ${4 * 1024 * 1024 + 1}`);
    expect(paths).toHaveLength(3);
    expect(paths[0]).toBe(`${'d'.repeat(200)}/file.txt`);
  });

  test('drops a path that the byte budget cut in half', async () => {
    const longPath = 'a'.repeat(4 * 1024 * 1024);
    const session = {
      description: 'cut enumeration sandbox',
      async run() {
        // The byte budget stops the command in the middle of a path.
        return {
          exitCode: 0,
          stdout: `${longPath}\n${'b'.repeat(30)}`,
          stderr: '',
        };
      },
    };

    const paths = await findSandboxFiles({
      // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- partial sandbox session for a test.
      session: session as never,
      pattern: '*',
      directory: '/home/user',
      ignore: [],
      limit: 1,
    });

    expect(paths).toEqual([longPath]);
  });

  test('reports an enumeration that reached its budget before the limit', async () => {
    const line = `${'d'.repeat(200)}/file.txt\n`;
    const session = {
      description: 'huge tree sandbox',
      async run() {
        return {
          exitCode: 0,
          stdout: line.repeat(Math.ceil((5 * 1024 * 1024) / line.length)),
          stderr: '',
        };
      },
    };

    // Pi cannot report a short list, so an incomplete answer is an error.
    await expect(
      findSandboxFiles({
        // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- partial sandbox session for a test.
        session: session as never,
        pattern: '*.md',
        directory: '/home/user',
        ignore: [],
        limit: 3,
      }),
    ).rejects.toThrow('stopped after 50000 files');
  });

  test('matches relative paths for patterns with a slash and applies the limit', async () => {
    const { session, root } = await setup();

    expect(
      await findSandboxFiles({
        session,
        pattern: 'src/**/*.ts',
        directory: root,
        ignore: [],
        limit: 1,
      }),
    ).toEqual(['src/a.ts']);
  });
});

describe('detectImageMimeType', () => {
  test('detects PNG and JPEG', () => {
    expect(
      detectImageMimeType({
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      }),
    ).toBe('image/png');
    expect(
      detectImageMimeType({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) }),
    ).toBe('image/jpeg');
    expect(
      detectImageMimeType({ bytes: new TextEncoder().encode('text') }),
    ).toBe(undefined);
  });
});

describe('expandSandboxHome', () => {
  test('replaces a leading tilde', () => {
    expect(expandSandboxHome({ path: '~', home: '/home/user' })).toBe(
      '/home/user',
    );
    expect(expandSandboxHome({ path: '~/a.txt', home: '/home/user' })).toBe(
      '/home/user/a.txt',
    );
    expect(expandSandboxHome({ path: 'a~b', home: '/home/user' })).toBe('a~b');
  });
});
