import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { afterAll, beforeAll, expect, it } from 'vitest';

const fixture = fileURLToPath(
  new URL('./__fixtures__/download-tls/', import.meta.url),
);
let directory: string;
let bundle: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ai-download-tls-'));
  bundle = join(directory, 'transport.mjs');
  await build({
    entryPoints: [
      fileURLToPath(new URL('./safe-node-fetch.ts', import.meta.url)),
    ],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

it.each([
  { trusted: true, address: '127.0.0.1', expected: 'secure content' },
  {
    trusted: false,
    address: '127.0.0.1',
    expected: 'DEPTH_ZERO_SELF_SIGNED_CERT',
  },
  {
    trusted: true,
    address: '::1',
    expected: 'ERR_TLS_CERT_ALTNAME_INVALID',
  },
])(
  'verifies HTTPS certificate trust and identity: %j',
  async ({ trusted, address, expected }) => {
    // Trust is configured before Node starts; do not disable TLS verification or
    // mutate the test runner's global CA configuration. The key is a test fixture.
    const script = `
    import { createServer } from 'node:https';
    import { readFileSync } from 'node:fs';
    import { once } from 'node:events';
    import { getDefaultDownloadFetch } from ${JSON.stringify(bundle)};
    const server = createServer({
      key: readFileSync(${JSON.stringify(join(fixture, 'key.pem'))}),
      cert: readFileSync(${JSON.stringify(join(fixture, 'cert.pem'))}),
    }, (_request, response) => response.end('secure content'));
    server.listen(0, ${JSON.stringify(address)});
    await once(server, 'listening');
    globalThis.fetch = () => { throw new Error('Unexpected global fetch'); };
    try {
      const fetch = await getDefaultDownloadFetch();
      const response = await fetch('https://${address.includes(':') ? `[${address}]` : address}:' + server.address().port);
      console.log(await response.text());
    } catch (error) {
      console.log(error.code);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  `;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '-e', script],
      {
        env: {
          ...process.env,
          NODE_EXTRA_CA_CERTS: trusted ? join(fixture, 'cert.pem') : '',
        },
        timeout: 5000,
      },
    );
    expect(stdout.trim()).toBe(expected);
  },
);
