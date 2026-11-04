import { createRequire } from 'node:module';
import { afterAll } from 'vitest';

// Opt-in for fixture suites only; provider-utils tests must use real sockets.
// Match the indirect CommonJS load used by the protected download transport.
const undici = createRequire(
  new URL('../packages/provider-utils/package.json', import.meta.url),
)('undici');
const originalUndiciFetch = undici.fetch;
const originalGlobalFetch = globalThis.fetch;

// Resolve late for per-test mocks/MSW; a vi.fn bridge would be reset by tests.
// Strip the real connector so delegating mocks cannot bypass their handlers.
undici.fetch = (input, { dispatcher: _dispatcher, ...init } = {}) => {
  if (globalThis.fetch === originalGlobalFetch) {
    const url = new URL(
      typeof input === 'object' && 'url' in input ? input.url : input,
    );
    if (url.protocol !== 'data:') {
      throw new Error(
        'Download fixture tests must install a global fetch mock',
      );
    }
  }
  return globalThis.fetch(input, init);
};

afterAll(() => {
  undici.fetch = originalUndiciFetch;
});
