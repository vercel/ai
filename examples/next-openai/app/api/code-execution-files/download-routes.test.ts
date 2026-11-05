import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as anthropic from './anthropic/[file]/route';

describe.each([['Anthropic', anthropic]] as const)(
  '%s file downloads',
  (_name, route) => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('VERCEL', undefined);
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
      vi.stubEnv('ANTHROPIC_MICROSOFT_API_KEY', 'test-key');
      vi.stubEnv('ANTHROPIC_MICROSOFT_RESOURCE_NAME', 'test-resource');
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    describe.each(['GET', 'POST'] as const)('%s', method => {
      const download = (url: string, headers?: Record<string, string>) =>
        route[method](
          new Request(url, {
            method,
            headers: { host: new URL(url).host, ...headers },
          }),
          {
            params: Promise.resolve({ file: 'file_test' }),
          },
        );

      it.each(['production', 'test', undefined])(
        'rejects NODE_ENV=%s before accessing provider credentials',
        async environment => {
          vi.stubEnv('NODE_ENV', environment);
          vi.stubEnv('ANTHROPIC_API_KEY', undefined);
          vi.stubEnv('ANTHROPIC_MICROSOFT_API_KEY', undefined);

          const response = await download('http://localhost:3000/download');

          expect(response.status).toBe(403);
          expect(response.headers.get('cache-control')).toBe('no-store');
          expect(fetch).not.toHaveBeenCalled();
        },
      );

      it('rejects hosted development', async () => {
        vi.stubEnv('VERCEL', '1');

        expect((await download('http://localhost:3000/download')).status).toBe(
          403,
        );
        expect(fetch).not.toHaveBeenCalled();
      });

      it.each(['example.com', 'localhost.example.com', '127.0.0.2'])(
        'rejects a non-local hostname: %s',
        async hostname => {
          expect((await download(`http://${hostname}/download`)).status).toBe(
            403,
          );
          expect(fetch).not.toHaveBeenCalled();
        },
      );

      it.each<Record<string, string>>([
        { origin: 'https://example.com' },
        { origin: 'null' },
        { origin: 'http://localhost:3001' },
        { 'sec-fetch-site': 'cross-site' },
        { 'sec-fetch-site': 'same-site' },
      ])('rejects cross-origin browser requests: %s', async headers => {
        expect(
          (await download('http://localhost:3000/download', headers)).status,
        ).toBe(403);
        expect(fetch).not.toHaveBeenCalled();
      });

      it.each<Record<string, string>>([
        { host: 'example.com:3000' },
        { host: 'localhost.example.com:3000' },
        { host: 'localhost:3001' },
        { host: '' },
        { host: 'rebind.example:3000', 'sec-fetch-site': 'same-origin' },
        { 'x-forwarded-host': 'public.example' },
        { 'x-forwarded-for': '192.0.2.1' },
        { 'x-forwarded-for': '192.0.2.1, 127.0.0.1' },
        { forwarded: 'for=192.0.2.1;host=public.example' },
      ])('rejects a hostile Host or forwarded client: %s', async headers => {
        // Next.js may use its bind address in request.url even when Host differs.
        const response = await download(
          'http://127.0.0.1:3000/download',
          headers,
        );

        expect(response.status).toBe(403);
        expect(fetch).not.toHaveBeenCalled();
      });

      it('rejects a missing Host header', async () => {
        const response = await route[method](
          new Request('http://127.0.0.1:3000/download', { method }),
          { params: Promise.resolve({ file: 'file_test' }) },
        );

        expect(response.status).toBe(403);
        expect(fetch).not.toHaveBeenCalled();
      });

      it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
        'allows Next.js forwarding headers for a direct loopback client: %s',
        async client => {
          vi.mocked(fetch)
            .mockResolvedValueOnce(
              Response.json({ filename: 'test.txt', size_bytes: 5 }),
            )
            .mockResolvedValueOnce(new Response('hello'));

          const response = await download('http://127.0.0.1:3000/download', {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'sec-fetch-site': 'same-origin',
            'x-forwarded-host': 'localhost:3000',
            'x-forwarded-for': client,
          });

          expect(response.status).toBe(200);
          expect(await response.text()).toBe('hello');
        },
      );

      it('allows local download navigation without Origin or Fetch Metadata', async () => {
        vi.mocked(fetch)
          .mockResolvedValueOnce(
            Response.json({ filename: 'test.txt', size_bytes: 5 }),
          )
          .mockResolvedValueOnce(new Response('hello'));

        const response = await download('http://127.0.0.1:3000/download');

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('hello');
      });

      it.each(['localhost', '127.0.0.1', '[::1]'])(
        'downloads a file on the local development server: %s',
        async hostname => {
          vi.mocked(fetch)
            .mockResolvedValueOnce(
              Response.json({ filename: 'test.txt', size_bytes: 5 }),
            )
            .mockResolvedValueOnce(new Response('hello'));

          const response = await download(`http://${hostname}:3000/download`, {
            origin: `http://${hostname}:3000`,
            'sec-fetch-site': 'same-origin',
          });

          expect(response.status).toBe(200);
          expect(await response.text()).toBe('hello');
          expect(response.headers.get('content-disposition')).toBe(
            "attachment; filename*=UTF-8''test.txt",
          );
          expect(fetch).toHaveBeenCalledTimes(2);
        },
      );
    });
  },
);
