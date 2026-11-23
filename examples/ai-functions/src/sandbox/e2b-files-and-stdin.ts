/*
 * Inspects, lists, and deletes paths in an E2B sandbox session, resolves a
 * relative working directory, caps the output that `run()` returns, and streams
 * standard input to a spawned process.
 */
import { createHash } from 'node:crypto';
import { createE2BNetworkSandboxSession } from '@ai-sdk/sandbox-e2b';
import { run } from '../lib/run';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const [actualJson, expectedJson] = [actual, expected].map(value =>
    JSON.stringify(value),
  );
  if (actualJson !== expectedJson) {
    throw new Error(`${label}: got ${actualJson}, expected ${expectedJson}`);
  }
  console.log(`${label}:`, actualJson);
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

run(async () => {
  process.exitCode = 1;

  const session = await createE2BNetworkSandboxSession({
    timeoutMs: 5 * 60 * 1000,
  });
  try {
    await session.writeTextFile({ path: 'files/hello.txt', content: 'hello' });
    await session.run({
      workingDirectory: 'files',
      command: [
        'ln -s hello.txt link',
        'ln -s missing broken',
        'mkdir dir',
        'ln -s dir dir-link',
        'mkfifo pipe',
        'touch .hidden "with space',
        'and newline"',
      ].join('\n'),
    });

    assertEqual(
      await session.stat({ path: 'files/hello.txt' }),
      { type: 'file', size: 5 },
      'stat file',
    );
    assertEqual(
      await session.stat({ path: 'files/link' }),
      { type: 'file', size: 5 },
      'stat follows a symbolic link',
    );
    assertEqual(
      (await session.stat({ path: 'files/pipe' }))?.type,
      'other',
      'stat named pipe',
    );
    assertEqual(
      await session.stat({ path: 'files/broken' }),
      null,
      'stat broken symbolic link',
    );
    assertEqual(
      await session.stat({ path: 'files/hello.txt/child' }),
      null,
      'stat path under a file',
    );

    const entries = await session.listDirectory({ path: 'files' });
    assertEqual(
      entries?.sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: '.hidden', type: 'file' },
        { name: 'broken', type: 'symlink' },
        { name: 'dir', type: 'directory' },
        { name: 'dir-link', type: 'symlink' },
        { name: 'hello.txt', type: 'file' },
        { name: 'link', type: 'symlink' },
        { name: 'pipe', type: 'other' },
        { name: 'with space\nand newline', type: 'file' },
      ],
      'listDirectory',
    );
    assertEqual(
      await session.listDirectory({ path: 'files/missing' }),
      null,
      'listDirectory missing',
    );

    assertEqual(
      await session.deleteFile({ path: 'files/missing' }),
      false,
      'deleteFile missing',
    );
    assertEqual(
      await session.deleteFile({ path: 'files/dir-link' }),
      true,
      'deleteFile symbolic link to a directory',
    );
    assertEqual(
      (await session.stat({ path: 'files/dir' }))?.type,
      'directory',
      'the link target remains',
    );

    const refused = await Promise.allSettled([
      session.deleteFile({ path: 'files/dir' }),
      session.writeTextFile({ path: 'files/dir', content: 'nope' }),
      session.listDirectory({ path: 'files/hello.txt' }),
    ]);
    assertEqual(
      refused.map(result => result.status),
      ['rejected', 'rejected', 'rejected'],
      'deleting or writing a directory and listing a file reject',
    );

    const { stdout: relativeDirectory } = await session.run({
      command: 'pwd',
      workingDirectory: 'files/dir',
    });
    const { stdout: baseDirectory } = await session.run({ command: 'pwd' });
    assertEqual(
      relativeDirectory.trim(),
      `${baseDirectory.trim()}/files/dir`,
      'relative workingDirectory',
    );

    assertEqual(
      await session.run({
        command: 'seq 1 100000; printf error >&2; exit 7',
        maxOutputLength: 4,
      }),
      {
        exitCode: 7,
        stdout: '1\n2\n',
        stderr: 'erro',
        stdoutLength: 588895,
        stderrLength: 5,
      },
      'run caps the returned output and reports the full lengths',
    );

    const closedStdin = await session.spawn({ command: 'cat' });
    assertEqual(
      await closedStdin.wait(),
      { exitCode: 0 },
      'stdin is closed unless requested',
    );

    // Bytes that are not valid UTF-8, large enough to cross one RPC message.
    const input = new Uint8Array(5 * 1024 * 1024).map(
      (_, index) => (index * 31) % 256,
    );
    const hash = await session.spawn({ command: 'sha256sum', stdin: true });
    const hashOutput = readAll(hash.stdout);
    const writer = hash.stdin.getWriter();
    await writer.write(input);
    await writer.close();
    assertEqual(await hash.wait(), { exitCode: 0 }, 'EOF ends the process');
    assertEqual(
      (await hashOutput).split(' ')[0],
      createHash('sha256').update(input).digest('hex'),
      'stdin bytes arrive unchanged',
    );

    process.exitCode = 0;
  } finally {
    await session.destroy();
  }
});
