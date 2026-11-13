import { afterEach, describe, expect, test, vi } from 'vitest';
import { FX_CLIENT_APP, createFxModelRuntime } from './fx-model-runtime';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('createFxModelRuntime', () => {
  test('throws without an AI Gateway credential', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');

    expect(() => createFxModelRuntime()).toThrow(
      'no AI Gateway credential found',
    );
  });

  test('sends AI Gateway requests to the configured base URL with client headers', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');
    vi.stubEnv('AI_GATEWAY_BASE_URL', 'https://gateway.example/proxy');
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('ok'),
    );
    vi.stubGlobal('fetch', fetch);
    const runtime = createFxModelRuntime();

    await runtime.fetch('https://ai-gateway.vercel.sh/v4/ai/language-model', {
      method: 'POST',
      headers: { authorization: 'Bearer test-key' },
      body: '{}',
    });
    await runtime.fetch('https://example.com/other');

    expect(runtime.apiKey).toBe('test-key');
    const calls = fetch.mock.calls;
    expect(calls.map(([url]) => String(url))).toEqual([
      'https://gateway.example/proxy/v4/ai/language-model',
      'https://example.com/other',
    ]);
    const headers = new Headers(calls[0][1]?.headers);
    expect(calls[0][1]?.method).toBe('POST');
    expect(headers.get('authorization')).toBe('Bearer test-key');
    expect(headers.get('user-agent')).toBe(FX_CLIENT_APP);
    expect(headers.get('x-client-app')).toBe(FX_CLIENT_APP);
  });
});
