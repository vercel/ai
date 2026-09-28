import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { vi } from 'vitest';

// Opt-in for fixture suites only; provider-utils tests use real sockets.
const transportPath = createRequire(
  new URL('../packages/provider-utils/package.json', import.meta.url),
).resolve('node-fetch');
const originalGlobalFetch = globalThis.fetch;

vi.doMock(transportPath, async () => {
  const actual = await vi.importActual(transportPath);
  return {
    ...actual,
    // Resolve late for per-test mocks/MSW. Strip the real connection agent.
    default: async (input, { agent: _agent, ...init } = {}) => {
      if (
        globalThis.fetch === originalGlobalFetch &&
        new URL(input).protocol !== 'data:'
      ) {
        throw new Error(
          'Download fixture tests must install a global fetch mock',
        );
      }
      const response = await globalThis.fetch(input, init);
      return new actual.Response(
        response.body == null ? null : Readable.fromWeb(response.body),
        {
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers],
          url: response.url,
        },
      );
    },
  };
});
