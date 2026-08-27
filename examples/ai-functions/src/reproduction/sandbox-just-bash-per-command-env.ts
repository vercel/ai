import assert from 'node:assert/strict';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      return output + decoder.decode();
    }
    output += decoder.decode(value, { stream: true });
  }
}

async function main() {
  const provider = createJustBashSandbox();
  const session = await provider.createSession({ sessionId: 'env-repro' });
  const workDir = '/home/user/work';

  try {
    const initialDirectoryProbe = await session.run({
      command: `test ! -e ${workDir}`,
    });
    assert.equal(
      initialDirectoryProbe.exitCode,
      0,
      `reproduction requires ${workDir} to be initially absent`,
    );

    const runResult = await session.run({
      command: 'printf "%s" "$WORK_DIR"',
      env: { WORK_DIR: workDir },
    });

    const process = await session.spawn({
      command: 'printf "%s" "$WORK_DIR"',
      env: { WORK_DIR: workDir },
    });
    const [spawnStdout, spawnStderr, spawnResult] = await Promise.all([
      collect(process.stdout),
      collect(process.stderr),
      process.wait(),
    ]);

    const mkdirResult = await session.run({
      command: 'mkdir -p "$WORK_DIR"',
      env: { WORK_DIR: workDir },
    });
    const directoryProbe = await session.run({
      command: `test -d ${workDir}`,
    });

    assert.deepStrictEqual(
      {
        run: runResult,
        spawn: {
          exitCode: spawnResult.exitCode,
          stdout: spawnStdout,
          stderr: spawnStderr,
        },
        mkdir: {
          exitCode: mkdirResult.exitCode,
          directoryExists: directoryProbe.exitCode === 0,
        },
      },
      {
        run: { exitCode: 0, stdout: workDir, stderr: '' },
        spawn: { exitCode: 0, stdout: workDir, stderr: '' },
        mkdir: { exitCode: 0, directoryExists: true },
      },
      'PER_COMMAND_ENV_BUG: env must be available to run and spawn, and mkdir must create WORK_DIR',
    );
  } finally {
    await session.stop();
  }
}

main();
