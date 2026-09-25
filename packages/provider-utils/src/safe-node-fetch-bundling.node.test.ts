import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(import.meta.dirname, '..');
const publicEntry = `export { fetchWithValidatedEndpoint } from '@ai-sdk/provider-utils';`;
let directory: string;

beforeEach(async () => {
  // Running outside the checkout prevents an omitted dependency from resolving
  // accidentally through the workspace's node_modules.
  directory = await mkdtemp(join(tmpdir(), 'provider-utils-bundling-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function verifyNodeTransport(entry: string) {
  const runner = join(directory, 'runner.mjs');
  await writeFile(
    runner,
    `
import assert from 'node:assert/strict';
import dns from 'node:dns';
import { pathToFileURL } from 'node:url';

let lookups = 0;
const dnsError = new Error('bundling-test-dns-lookup');
dns.lookup = (_hostname, _options, callback) => {
  lookups++;
  callback(dnsError);
};
globalThis.fetch = () => {
  throw new Error('Protected download fell back to global fetch');
};

const { fetchWithValidatedEndpoint } = await import(pathToFileURL(process.argv[2]));
await assert.rejects(
  fetchWithValidatedEndpoint({ url: 'https://download.example.com/file' }),
  error => {
    assert.equal(error.cause, dnsError, error.stack);
    return true;
  },
);
assert.equal(lookups, 1);
`,
  );
  const env = { ...process.env };
  // pnpm's executable shims can expose otherwise missing dependencies here.
  delete env.NODE_PATH;
  await execFileAsync(process.execPath, [runner, entry], {
    cwd: directory,
    env,
    timeout: 10_000,
  });
}

it('loads the protected transport from the unbundled package', async () => {
  await verifyNodeTransport(
    fileURLToPath(import.meta.resolve('@ai-sdk/provider-utils')),
  );
});

it.each(['cjs', 'esm'] as const)(
  'loads the protected transport after bundling and minifying for Node (%s)',
  async format => {
    const entry = join(
      directory,
      format === 'cjs' ? 'bundle.cjs' : 'bundle.mjs',
    );
    await build({
      stdin: { contents: publicEntry, resolveDir: packageDirectory },
      outfile: entry,
      bundle: true,
      minify: true,
      platform: 'node',
      format,
      // esbuild leaves Node built-in requires in bundled CommonJS dependencies.
      // Supply their standard ESM bridge; no third-party package is externalized.
      banner:
        format === 'esm'
          ? {
              js: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`,
            }
          : undefined,
    });
    await verifyNodeTransport(entry);
  },
);

describe.each([
  {
    runtime: 'browser',
    platform: 'browser' as const,
    conditions: ['browser'],
    globals: {},
  },
  {
    runtime: 'framework edge',
    platform: 'neutral' as const,
    conditions: ['edge-light'],
    globals: {
      EdgeRuntime: 'edge-runtime',
      process: { release: { name: 'node' }, versions: { node: '24.0.0' } },
    },
  },
  {
    runtime: 'Workers with Node compatibility',
    platform: 'neutral' as const,
    conditions: ['workerd', 'node'],
    globals: {
      process: {
        title: 'workerd',
        release: { name: 'node' },
        versions: { node: '24.0.0' },
      },
    },
  },
  {
    runtime: 'Bun',
    platform: 'neutral' as const,
    conditions: ['bun', 'node'],
    globals: {
      process: { release: { name: 'node' }, versions: { bun: '1.3.0' } },
    },
  },
  {
    runtime: 'Deno',
    platform: 'neutral' as const,
    conditions: ['deno', 'node'],
    globals: {
      process: { release: { name: 'node' }, versions: { deno: '2.4.0' } },
    },
  },
  {
    runtime: 'unknown runtime',
    platform: 'neutral' as const,
    conditions: [],
    globals: {},
  },
])('$runtime bundle', ({ platform, conditions, globals }) => {
  it('neither resolves Node dependencies nor loads them when downloading', async () => {
    const result = await build({
      stdin: { contents: publicEntry, resolveDir: packageDirectory },
      bundle: true,
      minify: true,
      platform,
      conditions,
      format: 'cjs',
      write: false,
      plugins: [
        {
          name: 'reject-node-transport-dependencies',
          setup(builder) {
            builder.onResolve({ filter: /.*/ }, args => {
              if (isBuiltin(args.path) || /^undici(?:\/|$)/.test(args.path)) {
                throw new Error(`Unexpected Node dependency: ${args.path}`);
              }
              return undefined;
            });
          },
        },
      ],
    });
    let requests = 0;
    const response = new Response('portable download');
    const exports: {
      fetchWithValidatedEndpoint?: (options: {
        url: string;
      }) => Promise<Response>;
    } = {};
    const context = {
      ...globals,
      module: { exports },
      URL,
      TextDecoder,
      TextEncoder,
      Headers,
      fetch: async () => {
        requests++;
        return response;
      },
    };
    runInNewContext(result.outputFiles[0].text, context);
    const fetchWithValidatedEndpoint =
      context.module.exports.fetchWithValidatedEndpoint;
    if (fetchWithValidatedEndpoint == null) {
      throw new Error('Bundle did not export fetchWithValidatedEndpoint');
    }
    expect(
      await fetchWithValidatedEndpoint({
        url: 'https://download.example.com/file',
      }),
    ).toBe(response);
    expect(requests).toBe(1);
  });
});
