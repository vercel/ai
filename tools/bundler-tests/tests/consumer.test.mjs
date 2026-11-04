import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import next from 'next';

// This file is copied into the isolated consumer so dependencies resolve there.
const consumer = dirname(fileURLToPath(import.meta.url));
const schemas = { schemas: ['zod3', 'zod4'], messages: 1, rejected: true };

test(
  'Next.js production server validates schemas and generates and streams through a provider',
  {
    timeout: 30_000,
  },
  async t => {
    const app = next({ dev: false, dir: consumer });
    const server = createServer(app.getRequestHandler());
    t.after(async () => {
      try {
        server.closeAllConnections();
        if (server.listening) {
          await new Promise((resolve, reject) => {
            server.close(error => (error ? reject(error) : resolve()));
          });
        }
      } finally {
        await app.close();
      }
    });

    await app.prepare();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/check`,
      {
        signal: t.signal,
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      schemas,
      generated: 'generated',
      streamed: 'streamed',
    });
  },
);

test(
  'browser-targeted production bundle initializes and validates schemas in Node',
  {
    timeout: 30_000,
  },
  async () => {
    const outfile = join(consumer, 'browser-check.mjs');
    const result = await build({
      absWorkingDir: consumer,
      entryPoints: ['lib/check-schemas.ts'],
      outfile,
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2022',
      minify: true,
      treeShaking: true,
      metafile: true,
    });
    // The smoke test must execute the bundled SDK, with no runtime fallback to
    // node_modules or Node built-ins. These schema checks do not need DOM APIs.
    assert.deepEqual(
      Object.values(result.metafile.outputs).flatMap(output => output.imports),
      [],
    );
    const { checkSchemas } = await import(pathToFileURL(outfile).href);
    assert.deepEqual(await checkSchemas(), schemas);
  },
);
