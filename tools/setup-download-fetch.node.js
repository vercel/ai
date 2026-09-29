import { Readable, Writable } from 'node:stream';
import { afterAll } from 'vitest';
import { callbackify } from 'node:util';

// Opt-in for fixture suites only. Real-socket security tests use a fresh process.
// Bridge the private HTTP transport to existing per-test global fetch mocks.
const originalGetBuiltinModule = process.getBuiltinModule;
const originalGlobalFetch = globalThis.fetch;
process.getBuiltinModule = id => {
  const builtin = originalGetBuiltinModule(id);
  if (id !== 'node:http' && id !== 'node:https') return builtin;
  return {
    ...builtin,
    request(url, options, onResponse) {
      const chunks = [];
      let incoming;
      const request = new Writable({
        autoDestroy: false,
        write(chunk, _encoding, done) {
          chunks.push(chunk);
          done();
        },
        final(done) {
          callbackify(async () => {
            if (globalThis.fetch === originalGlobalFetch) {
              throw new Error(
                'Download fixture tests must install a global fetch mock',
              );
            }
            const response = await globalThis.fetch(url.toString(), {
              method: options.method,
              headers: options.headers,
              signal: options.signal,
              redirect: 'manual',
              ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
            });
            incoming =
              response.body == null
                ? Readable.from([])
                : Readable.fromWeb(response.body);
            Object.assign(incoming, {
              statusCode: response.status,
              statusMessage: response.statusText,
              rawHeaders: [...response.headers]
                .filter(([name]) => name !== 'content-encoding')
                .flat(),
            });
            incoming.once('close', () => request.destroy());
            onResponse(incoming);
          })(done);
        },
        destroy(error, done) {
          incoming?.destroy(error ?? undefined);
          options.signal?.removeEventListener('abort', abort);
          done(error);
        },
      });
      // Fixture streams have no sockets and therefore no inactivity timeout.
      request.setTimeout = () => request;
      const abort = () => request.destroy(options.signal.reason);
      options.signal?.addEventListener('abort', abort, { once: true });
      return request;
    },
  };
};
afterAll(() => {
  process.getBuiltinModule = originalGetBuiltinModule;
});
