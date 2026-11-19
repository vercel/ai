/*
 * Verifies the session methods that depend on how a real Modal sandbox behaves:
 * `stat()`, `listDirectory()`, and `deleteFile()`, one base directory for
 * relative paths, rejecting a write to a directory, capped `run()` output, and
 * writable stdin.
 */
import { deepStrictEqual, rejects, strictEqual } from 'node:assert/strict';
import { createModalNetworkSandboxSession } from '@ai-sdk/sandbox-modal';
import { run } from '../lib/run';

const encoder = new TextEncoder();

run(async () => {
  process.exitCode = 1;

  const session = await createModalNetworkSandboxSession({
    timeoutMs: 5 * 60 * 1000,
    cpu: 0.25,
    memoryMiB: 512,
  });
  try {
    const setup = await session.run({
      command: [
        'mkdir -p dir deep/inner empty',
        'printf hello > file.txt',
        'touch dir/nested.txt .hidden',
        'ln -s file.txt file-link',
        'ln -s dir dir-link',
        'ln -s missing broken-link',
        'ln -s deep/inner inner-link',
        'mkfifo fifo',
      ].join(' && '),
    });
    strictEqual(setup.exitCode, 0, setup.stderr);

    deepStrictEqual(await session.stat({ path: 'file.txt' }), {
      type: 'file',
      size: 5,
    });
    deepStrictEqual(await session.stat({ path: 'file-link' }), {
      type: 'file',
      size: 5,
    });
    strictEqual((await session.stat({ path: 'dir-link' }))?.type, 'directory');
    strictEqual((await session.stat({ path: 'fifo' }))?.type, 'other');
    strictEqual(await session.stat({ path: 'missing' }), null);
    strictEqual(await session.stat({ path: 'broken-link' }), null);
    strictEqual(await session.stat({ path: 'file.txt/child' }), null);
    console.log('ok: stat');

    const entries = await session.listDirectory({ path: '.' });
    deepStrictEqual(
      entries?.sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: '.hidden', type: 'file' },
        { name: 'broken-link', type: 'symlink' },
        { name: 'deep', type: 'directory' },
        { name: 'dir', type: 'directory' },
        { name: 'dir-link', type: 'symlink' },
        { name: 'empty', type: 'directory' },
        { name: 'fifo', type: 'other' },
        { name: 'file-link', type: 'symlink' },
        { name: 'file.txt', type: 'file' },
        { name: 'inner-link', type: 'symlink' },
      ],
    );
    deepStrictEqual(await session.listDirectory({ path: 'empty' }), []);
    strictEqual(await session.listDirectory({ path: 'missing' }), null);
    await rejects(async () => session.listDirectory({ path: 'file.txt' }));
    deepStrictEqual(await session.listDirectory({ path: 'inner-link/..' }), [
      { name: 'inner', type: 'directory' },
    ]);
    console.log('ok: listDirectory');

    strictEqual(await session.deleteFile({ path: 'missing' }), false);
    await rejects(async () => session.deleteFile({ path: 'empty' }));
    strictEqual(await session.deleteFile({ path: 'dir-link' }), true);
    strictEqual((await session.stat({ path: 'dir' }))?.type, 'directory');
    strictEqual(await session.deleteFile({ path: 'broken-link' }), true);
    console.log('ok: deleteFile');

    const { stdout: base } = await session.run({ command: 'pwd' });
    const { stdout: relative } = await session.run({
      command: 'pwd',
      workingDirectory: 'dir',
    });
    strictEqual(relative.trim(), `${base.trim()}/dir`);
    await session.writeTextFile({ path: 'deep/sibling.txt', content: 'kept' });
    strictEqual(
      await session.readTextFile({ path: 'inner-link/../sibling.txt' }),
      'kept',
    );
    strictEqual(
      await session.readTextFile({ path: `${base.trim()}/file.txt` }),
      'hello',
    );
    console.log('ok: one base directory for relative paths');

    await rejects(async () =>
      session.writeTextFile({ path: 'dir', content: 'x' }),
    );
    strictEqual((await session.stat({ path: 'dir' }))?.type, 'directory');
    console.log('ok: a write to a directory is rejected');

    deepStrictEqual(
      await session.run({
        command:
          'head -c 3000000 /dev/zero | tr "\\0" x; printf abcdef >&2; exit 3',
        maxOutputLength: 4,
      }),
      {
        exitCode: 3,
        stdout: 'xxxx',
        stderr: 'abcd',
        stdoutLength: 3_000_000,
        stderrLength: 6,
      },
    );
    console.log('ok: run() caps its output and reports the full lengths');

    const cat = await session.spawn({ command: 'cat', stdin: true });
    const output = new Response(cat.stdout).text();
    const catWriter = cat.stdin.getWriter();
    await catWriter.write(encoder.encode('through stdin'));
    await catWriter.close();
    deepStrictEqual(await cat.wait(), { exitCode: 0 });
    strictEqual(await output, 'through stdin');
    console.log('ok: stdin reaches the process and closing it delivers EOF');

    const count = await session.spawn({ command: 'wc -c', stdin: true });
    const countOutput = new Response(count.stdout).text();
    const size = 8 * 1024 * 1024;
    const countWriter = count.stdin.getWriter();
    await countWriter.write(new Uint8Array(size));
    await countWriter.close();
    await count.wait();
    strictEqual(Number((await countOutput).trim()), size);
    console.log('ok: a large stdin write arrives whole');

    const closed = await session.spawn({ command: 'true', stdin: true });
    await closed.wait();
    await closed.stdin.close();
    console.log('ok: closing stdin after the process exited');

    const killed = await session.spawn({ command: 'cat', stdin: true });
    await killed.kill();
    await killed.wait();
    console.log('ok: a process waiting on stdin can be killed');

    const untouched = await session.spawn({ command: 'cat' });
    deepStrictEqual(await untouched.wait(), { exitCode: 0 });
    console.log('ok: stdin is closed by default');

    console.log('ok: the Modal session methods work on a live sandbox');
    process.exitCode = 0;
  } finally {
    await session.destroy();
  }
});
