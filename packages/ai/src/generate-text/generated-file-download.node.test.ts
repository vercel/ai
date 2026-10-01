import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

// Use a fresh process: the Node fixture setup deliberately replaces Undici's
// transport, which would otherwise conceal regressions in DNS protection.
describe('generated file download DNS protection', () => {
  it.each(['before', 'after'])(
    'rejects private DNS results with global fetch replaced %s import',
    async timing => {
      const resolverUrl = new URL(
        './resolve-generated-file-data.ts',
        import.meta.url,
      ).href;
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '--eval',
          `
          import dns from 'node:dns';
          let lookups = 0;
          dns.lookup = (_hostname, options, callback) => {
            lookups++;
            queueMicrotask(() => callback(null, options.all
              ? [{ address: '127.0.0.1', family: 4 }]
              : '127.0.0.1', 4));
          };
          let fetchCalls = 0;
          const wrappedFetch = async () => {
            fetchCalls++;
            return new Response('unvalidated content');
          };
          if (${JSON.stringify(timing)} === 'before') globalThis.fetch = wrappedFetch;
          const { resolveGeneratedFileData } = await import(${JSON.stringify(resolverUrl)});
          if (${JSON.stringify(timing)} === 'after') globalThis.fetch = wrappedFetch;
          let blocked = false;
          try {
            await resolveGeneratedFileData({
              data: { type: 'url', url: new URL('https://files.example.com/file') },
              abortSignal: AbortSignal.timeout(2000),
            });
          } catch (error) {
            blocked = error.cause?.cause?.message.includes(
              'resolved to disallowed IP address 127.0.0.1'
            ) === true;
          }
          console.log(JSON.stringify({ blocked, lookups, fetchCalls }));
        `,
        ],
        { timeout: 10_000 },
      );
      expect(JSON.parse(stdout)).toEqual({
        blocked: true,
        lookups: 1,
        fetchCalls: 0,
      });
    },
  );
});
