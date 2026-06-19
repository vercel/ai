/**
 * Real end-to-end smoke test for the Tensorlake sandbox adapter.
 *
 * Drives an actual Tensorlake sandbox through the adapter's public surface:
 * create → write/read file → run command → spawn process → advertise a port and
 * open a tunnel via getPortUrl → stop/destroy. Run against a live account:
 *
 *   TENSORLAKE_API_KEY=... pnpm tsx scripts/smoke.ts
 *
 * Not part of the unit suite (it costs a real sandbox and network round-trips).
 */
import { createTensorlakeSandbox } from '../src/tensorlake-sandbox';

const WORKDIR = '/home/tl-user';

function step(label: string) {
  console.log(`\n▶ ${label}`);
}

async function main() {
  if (!process.env.TENSORLAKE_API_KEY) {
    throw new Error('TENSORLAKE_API_KEY is not set.');
  }

  const provider = createTensorlakeSandbox({
    cpus: 1,
    memoryMb: 1024,
    ports: [3000],
  });

  console.log(`provider.providerId = ${provider.providerId}`);
  console.log(
    `provider.specificationVersion = ${provider.specificationVersion}`,
  );

  step('createSession()');
  const session = await provider.createSession();
  const restricted = session.restricted();
  console.log(restricted.description);

  try {
    step('writeTextFile + readFile round-trip');
    await restricted.writeTextFile({
      path: `${WORKDIR}/hello.txt`,
      content: 'hi from smoke test',
    });
    const stream = await restricted.readFile({ path: `${WORKDIR}/hello.txt` });
    const text = stream ? await new Response(stream).text() : '<null>';
    console.log(`read back: ${JSON.stringify(text)}`);
    if (text !== 'hi from smoke test') {
      throw new Error(`file round-trip mismatch: got ${JSON.stringify(text)}`);
    }

    step('run() a command');
    const run = await restricted.run({
      command: 'echo stdout-line && echo stderr-line 1>&2 && exit 7',
      workingDirectory: WORKDIR,
    });
    console.log(
      `exitCode=${run.exitCode} stdout=${JSON.stringify(
        run.stdout.trim(),
      )} stderr=${JSON.stringify(run.stderr.trim())}`,
    );
    if (run.exitCode !== 7 || !run.stdout.includes('stdout-line')) {
      throw new Error('run() result not as expected');
    }

    step('spawn() a process, read its stdout stream, await exit');
    const proc = await restricted.spawn({
      command: 'for i in 1 2 3; do echo line-$i; done',
      workingDirectory: WORKDIR,
    });
    const spawnStdout = await new Response(proc.stdout).text();
    const { exitCode: spawnExit } = await proc.wait();
    console.log(
      `spawn exitCode=${spawnExit} stdout=${JSON.stringify(
        spawnStdout.trim(),
      )}`,
    );
    if (spawnExit !== 0 || !spawnStdout.includes('line-2')) {
      throw new Error('spawn() result not as expected');
    }

    step('ports + getPortUrl() tunnel');
    console.log(`session.ports = ${JSON.stringify(session.ports)}`);
    // Start a trivial listener on 3000 in the sandbox, then tunnel to it.
    await restricted.spawn({
      command:
        'python3 -c \'import http.server,socketserver; socketserver.TCPServer(("0.0.0.0",3000), http.server.SimpleHTTPRequestHandler).serve_forever()\'',
      workingDirectory: WORKDIR,
    });
    // Give the listener a moment to bind.
    await new Promise(r => setTimeout(r, 1500));
    const url = await session.getPortUrl({ port: 3000 });
    console.log(`getPortUrl(3000) = ${url}`);
    try {
      const res = await fetch(url);
      console.log(`fetch via tunnel: HTTP ${res.status}`);
    } catch (e) {
      console.log(
        `fetch via tunnel failed (non-fatal): ${(e as Error).message}`,
      );
    }

    step('SUCCESS — adapter drove a real sandbox end-to-end');
  } finally {
    step('stop() + destroy()');
    await session.stop().catch(e => console.log(`stop error: ${e.message}`));
    await session
      .destroy()
      .catch(e => console.log(`destroy error: ${e.message}`));
    console.log('cleaned up.');
  }
}

main().catch(err => {
  console.error('\n✖ smoke test failed:', err);
  process.exit(1);
});
