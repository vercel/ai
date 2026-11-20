import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GET as anthropicGET,
  POST as anthropicPOST,
} from './anthropic/[file]/route';
import {
  GET as anthropicMsGET,
  POST as anthropicMsPOST,
} from './anthropic-microsoft/[file]/route';

describe('code-execution-files routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('anthropic/[file]/route', () => {
    it.each([
      '../secret',
      '../../etc/passwd',
      'file/nested',
      'file!123',
      'file@name',
      ' ',
      '',
    ])(
      'rejects invalid file id "%s" with 400 Bad Request',
      async (invalidFile) => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        const req = new Request(
          `https://localhost/api/code-execution-files/anthropic/${encodeURIComponent(invalidFile)}`,
        );
        const response = await anthropicGET(req, {
          params: Promise.resolve({ file: invalidFile }),
        });

        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Invalid file ID');
      },
    );

    it('returns 500 if ANTHROPIC_API_KEY is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const req = new Request(
        'https://localhost/api/code-execution-files/anthropic/file_123',
      );
      const response = await anthropicGET(req, {
        params: Promise.resolve({ file: 'file_123' }),
      });

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('ANTHROPIC_API_KEY is not set');
    });

    it('returns upstream status if metadata fetch fails', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (typeof url === 'string' && url.endsWith('/content')) {
          return new Response('content', { status: 200 });
        }
        return new Response('Not found', {
          status: 404,
          statusText: 'Not Found',
        });
      });

      const req = new Request(
        'https://localhost/api/code-execution-files/anthropic/file_not_found',
      );
      const response = await anthropicGET(req, {
        params: Promise.resolve({ file: 'file_not_found' }),
      });

      expect(response.status).toBe(404);
      expect(await response.text()).toContain(
        'Failed to fetch file metadata: Not Found',
      );
    });

    it('returns upstream status if content download fails', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (typeof url === 'string' && url.endsWith('/content')) {
          return new Response('Forbidden', {
            status: 403,
            statusText: 'Forbidden',
          });
        }
        return new Response(
          JSON.stringify({
            type: 'file',
            id: 'file_123',
            size_bytes: 11,
            created_at: new Date(),
            filename: 'plot.png',
            mime_type: 'image/png',
          }),
          { status: 200 },
        );
      });

      const req = new Request(
        'https://localhost/api/code-execution-files/anthropic/file_123',
      );
      const response = await anthropicGET(req, {
        params: Promise.resolve({ file: 'file_123' }),
      });

      expect(response.status).toBe(403);
      expect(await response.text()).toContain(
        'Failed to download file content: Forbidden',
      );
    });

    it('successfully downloads file with valid Anthropic file ID via GET and POST', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const fileContent = 'hello world';

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (typeof url === 'string' && url.endsWith('/content')) {
          return new Response(fileContent, { status: 200 });
        }
        return new Response(
          JSON.stringify({
            type: 'file',
            id: 'file_01abcXYZ',
            size_bytes: fileContent.length,
            created_at: new Date(),
            filename: 'data chart.csv',
            mime_type: 'text/csv',
          }),
          { status: 200 },
        );
      });

      for (const handler of [anthropicGET, anthropicPOST]) {
        const req = new Request(
          'https://localhost/api/code-execution-files/anthropic/file_01abcXYZ',
        );
        const response = await handler(req, {
          params: Promise.resolve({ file: 'file_01abcXYZ' }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe(
          'application/octet-stream',
        );
        expect(response.headers.get('Content-Length')).toBe(
          String(fileContent.length),
        );
        expect(response.headers.get('X-File-Name')).toBe(
          encodeURIComponent('data chart.csv'),
        );
        expect(response.headers.get('Content-Disposition')).toBe(
          `attachment; filename*=UTF-8''${encodeURIComponent('data chart.csv')}`,
        );
        expect(await response.text()).toBe(fileContent);
      }
    });
  });

  describe('anthropic-microsoft/[file]/route', () => {
    it('rejects invalid file id with 400 Bad Request', async () => {
      process.env.ANTHROPIC_MICROSOFT_RESOURCE_NAME = 'my-resource';
      process.env.ANTHROPIC_MICROSOFT_API_KEY = 'test-key';

      const req = new Request(
        'https://localhost/api/code-execution-files/anthropic-microsoft/..%2Fbad',
      );
      const response = await anthropicMsGET(req, {
        params: Promise.resolve({ file: '../bad' }),
      });

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid file ID');
    });

    it('returns 500 if resource name or API key is missing', async () => {
      delete process.env.ANTHROPIC_MICROSOFT_RESOURCE_NAME;
      delete process.env.ANTHROPIC_MICROSOFT_API_KEY;

      const req = new Request(
        'https://localhost/api/code-execution-files/anthropic-microsoft/file_123',
      );
      const response = await anthropicMsGET(req, {
        params: Promise.resolve({ file: 'file_123' }),
      });

      expect(response.status).toBe(500);
      expect(await response.text()).toBe(
        'ANTHROPIC_MICROSOFT_RESOURCE_NAME or ANTHROPIC_MICROSOFT_API_KEY not configured',
      );
    });

    it('successfully downloads file with valid Anthropic file ID via GET and POST', async () => {
      process.env.ANTHROPIC_MICROSOFT_RESOURCE_NAME = 'my-resource';
      process.env.ANTHROPIC_MICROSOFT_API_KEY = 'test-key';
      const fileContent = 'binary content';

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        expect(url).toContain(
          'https://my-resource.services.ai.azure.com/anthropic/v1/files/file_01abcXYZ',
        );
        if (typeof url === 'string' && url.endsWith('/content')) {
          return new Response(fileContent, { status: 200 });
        }
        return new Response(
          JSON.stringify({
            type: 'file',
            id: 'file_01abcXYZ',
            size_bytes: fileContent.length,
            created_at: new Date(),
            filename: 'output.json',
            mime_type: 'application/json',
          }),
          { status: 200 },
        );
      });

      for (const handler of [anthropicMsGET, anthropicMsPOST]) {
        const req = new Request(
          'https://localhost/api/code-execution-files/anthropic-microsoft/file_01abcXYZ',
        );
        const response = await handler(req, {
          params: Promise.resolve({ file: 'file_01abcXYZ' }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe(
          'application/octet-stream',
        );
        expect(response.headers.get('Content-Length')).toBe(
          String(fileContent.length),
        );
        expect(response.headers.get('X-File-Name')).toBe(
          encodeURIComponent('output.json'),
        );
        expect(response.headers.get('Content-Disposition')).toBe(
          `attachment; filename*=UTF-8''${encodeURIComponent('output.json')}`,
        );
        expect(await response.text()).toBe(fileContent);
      }
    });
  });
});
