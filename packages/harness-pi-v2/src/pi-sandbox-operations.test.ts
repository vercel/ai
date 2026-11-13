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
