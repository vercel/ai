import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as azure from '../download-container-file/azure/route';
import * as openai from '../download-container-file/openai/route';

describe.each([
  ['OpenAI', openai],
  ['Azure', azure],
] as const)('%s container file downloads', (_name, route) => {
  const url =
    'http://127.0.0.1:3000/download?container_id=container_test&file_id=file_test';

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', undefined);
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('AZURE_API_KEY', 'test-key');
    vi.stubEnv('AZURE_RESOURCE_NAME', 'test-resource');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rejects production before reading credentials or file IDs', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OPENAI_API_KEY', undefined);
    vi.stubEnv('AZURE_API_KEY', undefined);

    const response = await route.GET(
      new Request('http://127.0.0.1:3000/download'),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects DNS rebinding before contacting the provider', async () => {
    const response = await route.GET(
      new Request(url, {
        headers: {
          host: 'rebind.example:3000',
          'sec-fetch-site': 'same-origin',
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows a direct local development download', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('hello'));

    const response = await route.GET(
      new Request(url, {
        headers: { host: '127.0.0.1:3000', 'x-forwarded-for': '127.0.0.1' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
