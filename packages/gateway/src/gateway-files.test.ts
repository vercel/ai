import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import {
  GatewayAuthenticationError,
  GatewayInternalServerError,
  GatewayInvalidRequestError,
  GatewayNotFoundError,
  GatewayRateLimitError,
} from './errors';
import { GatewayFiles, type GatewayFilesConfig } from './gateway-files';

const FILES_URL = 'https://api.test.com/v1/files';

const server = createTestServer({
  [FILES_URL]: {},
});

function createFiles(overrides: Partial<GatewayFilesConfig> = {}) {
  return new GatewayFiles({
    provider: 'gateway.files',
    filesURL: FILES_URL,
    headers: () => ({
      Authorization: 'Bearer test-key',
      'ai-gateway-auth-method': 'api-key',
    }),
    o11yHeaders: { 'ai-o11y-deployment-id': 'test-deployment' },
    ...overrides,
  });
}

function prepareFileResponse(
  body: Record<string, unknown> = {
    id: 'gwfile_123',
    object: 'file',
    bytes: 3,
    created_at: 1700000000,
    expires_at: 1702592000,
    filename: 'report.pdf',
    purpose: 'user_data',
    status: 'processed',
  },
) {
  server.urls[FILES_URL].response = { type: 'json-value', body };
}

function prepareErrorResponse(
  status: number,
  type: string,
  message = 'files error',
) {
  server.urls[FILES_URL].response = {
    type: 'error',
    status,
    body: JSON.stringify({ error: { message, type, param: null, code: null } }),
  };
}

function streamFromChunks(chunks: Array<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('GatewayFiles', () => {
  it('should expose the configured provider id', () => {
    expect(createFiles().provider).toBe('gateway.files');
    expect(createFiles().specificationVersion).toBe('v4');
  });

  describe('uploadFile', () => {
    it('should post a multipart upload with purpose user_data', async () => {
      prepareFileResponse();

      await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/pdf',
        filename: 'report.pdf',
      });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(FILES_URL);

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(Object.keys(multipart!).sort()).toEqual(['file', 'purpose']);
      expect(multipart!.purpose).toBe('user_data');
      const file = multipart!.file as File;
      expect(file.name).toBe('report.pdf');
      expect(file.type).toBe('application/pdf');
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3]),
      );
    });

    it('should send auth, o11y and call headers without an idempotency key', async () => {
      prepareFileResponse();

      await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/pdf',
        headers: { 'x-custom': 'value' },
      });

      const headers = server.calls[0].requestHeaders;
      expect(headers).toMatchObject({
        authorization: 'Bearer test-key',
        'ai-o11y-deployment-id': 'test-deployment',
        'x-custom': 'value',
      });
      expect(headers).not.toHaveProperty('idempotency-key');
    });

    it('should decode base64 data', async () => {
      prepareFileResponse();

      await createFiles().uploadFile({
        data: { type: 'data', data: 'AQID' },
        mediaType: 'image/png',
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      const file = multipart!.file as File;
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3]),
      );
    });

    it('should upload text data as UTF-8', async () => {
      prepareFileResponse();

      await createFiles().uploadFile({
        data: { type: 'text', text: 'hello' },
        mediaType: 'text/plain',
        filename: 'notes.txt',
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(await (multipart!.file as File).text()).toBe('hello');
    });

    it('should default the filename to "blob"', async () => {
      prepareFileResponse();

      await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/pdf',
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect((multipart!.file as File).name).toBe('blob');
    });

    it('should stream a multipart upload', async () => {
      prepareFileResponse();

      await createFiles().uploadFile({
        data: { type: 'stream', stream: streamFromChunks(['a,b\n', '1,2\n']) },
        mediaType: 'text/csv',
        filename: 'table.csv',
      });

      expect(server.calls[0].requestHeaders['content-type']).toMatch(
        /^multipart\/form-data; boundary=/,
      );
      const multipart = await server.calls[0].requestBodyMultipart;
      expect(Object.keys(multipart!).sort()).toEqual(['file', 'purpose']);
      expect(multipart!.purpose).toBe('user_data');
      const file = multipart!.file as File;
      expect(file.name).toBe('table.csv');
      expect(await file.text()).toBe('a,b\n1,2\n');
    });

    it('should return a gateway provider reference and file details', async () => {
      prepareFileResponse();

      const result = await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/pdf',
        filename: 'local.pdf',
      });

      expect(result).toEqual({
        warnings: [],
        providerReference: { gateway: 'gwfile_123' },
        mediaType: 'application/pdf',
        filename: 'report.pdf',
        byteSize: 3,
        createdAt: new Date(1700000000 * 1000),
        expiresAt: new Date(1702592000 * 1000),
        providerMetadata: {
          gateway: {
            filename: 'report.pdf',
            purpose: 'user_data',
            bytes: 3,
            createdAt: 1700000000,
            status: 'processed',
            expiresAt: 1702592000,
          },
        },
      });
    });

    it('should fall back to the request filename and omit missing fields', async () => {
      prepareFileResponse({ id: 'gwfile_456' });

      const result = await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'image/png',
        filename: 'photo.png',
      });

      expect(result).toEqual({
        warnings: [],
        providerReference: { gateway: 'gwfile_456' },
        mediaType: 'image/png',
        filename: 'photo.png',
        providerMetadata: { gateway: {} },
      });
    });

    it('should cancel a stream when headers cannot be resolved', async () => {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      });

      await expect(
        createFiles({
          headers: () => Promise.reject(new Error('no auth')),
        }).uploadFile({
          data: { type: 'stream', stream },
          mediaType: 'application/pdf',
        }),
      ).rejects.toThrow('no auth');

      expect(cancelled).toBe(true);
      expect(server.calls).toHaveLength(0);
    });

    describe('errors', () => {
      it.each([
        [400, GatewayInvalidRequestError],
        [404, GatewayNotFoundError],
        [413, GatewayInvalidRequestError],
        [429, GatewayRateLimitError],
      ])(
        'should map an invalid_request_error with status %i by status',
        async (status, errorClass) => {
          prepareErrorResponse(status, 'invalid_request_error', 'refused');

          const error = await createFiles()
            .uploadFile({
              data: { type: 'data', data: new Uint8Array([1]) },
              mediaType: 'application/pdf',
            })
            .catch(e => e);

          expect(errorClass.isInstance(error)).toBe(true);
          expect(error.statusCode).toBe(status);
          expect(error.message).toBe('refused');
        },
      );

      it('should map a 401 to an authentication error', async () => {
        prepareErrorResponse(401, 'invalid_request_error');

        const error = await createFiles()
          .uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/pdf',
          })
          .catch(e => e);

        expect(GatewayAuthenticationError.isInstance(error)).toBe(true);
        expect(error.statusCode).toBe(401);
      });

      it('should map a server_error to a retryable internal server error', async () => {
        prepareErrorResponse(503, 'server_error', 'unavailable');

        const error = await createFiles()
          .uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/pdf',
          })
          .catch(e => e);

        expect(GatewayInternalServerError.isInstance(error)).toBe(true);
        expect(error.statusCode).toBe(503);
        expect(error.isRetryable).toBe(true);
      });

      it('should keep a gateway-specific error type', async () => {
        prepareErrorResponse(400, 'rate_limit_exceeded', 'slow down');

        const error = await createFiles()
          .uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/pdf',
          })
          .catch(e => e);

        expect(GatewayRateLimitError.isInstance(error)).toBe(true);
        expect(error.statusCode).toBe(400);
      });
    });
  });
});
