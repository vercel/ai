import assert from 'node:assert/strict';
import { createJustBashSandboxSessionFromNativeSandbox } from '@ai-sdk/sandbox-just-bash';

const totalItems = 200;
const bytesPerItem = 1024;
const failureSignal =
  'ISSUE_22979_REPRODUCED: paused stdout consumer did not apply backpressure to the native log iterator';

async function main() {
  let produced = 0;
  let markSourceDrained!: () => void;
  const sourceDrained = new Promise<void>(resolve => {
    markSourceDrained = resolve;
  });

  const session = createJustBashSandboxSessionFromNativeSandbox({
    bashEnvInstance: {
      getCwd: () => '/',
      exec: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
    runCommand: async () => ({
      async *logs() {
        for (let index = 0; index < totalItems; index++) {
          produced++;
          yield { type: 'stdout' as const, data: 'x'.repeat(bytesPerItem) };
        }
        markSourceDrained();
      },
      async wait() {
        return { exitCode: 0 };
      },
      async kill() {},
    }),
  } as never);

  const child = await session.spawn({ command: 'synthetic' });

  await Promise.race([
    sourceDrained,
    new Promise<void>(resolve => {
      setTimeout(resolve, 100);
    }),
  ]);
  const producedBeforeRead = produced;

  let readBytes = 0;
  for await (const chunk of child.stdout) {
    readBytes += chunk.byteLength;
  }
  await child.stderr.cancel();
  await child.wait();

  console.log(
    JSON.stringify({
      producedBeforeRead,
      totalItems,
      queuedBytesBeforeRead: producedBeforeRead * bytesPerItem,
      readBytes,
    }),
  );

  assert.equal(
    readBytes,
    totalItems * bytesPerItem,
    'all native log bytes should be delivered after stdout consumption resumes',
  );
  assert.ok(producedBeforeRead < totalItems, failureSignal);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
