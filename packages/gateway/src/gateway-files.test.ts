import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import {
  GatewayAuthenticationError,
  GatewayInternalServerError,
  GatewayInvalidRequestError,
  GatewayNotFoundError,
  GatewayRateLimitError,
} from './errors';
import { createGateway } from './gateway-provider';

const BASE_URL = 'https://api.test.com/v4/ai';
const FILES_URL = `${BASE_URL}/files`;
const FILE_URL = `${FILES_URL}/gwfile_123`;
const ENCODED_FILE_URL = `${FILES_URL}/a%2Fb`;

const server = createTestServer({
  [FILES_URL]: {},
  [FILE_URL]: {},
  [ENCODED_FILE_URL]: {},
});

const fileObject = {
  id: 'gwfile_123',
  object: 'file',
  bytes: 3,
  created_at: 1700000000,
  expires_at: 1702592000,
  filename: 'report.pdf',
  purpose: 'user_data',
  status: 'processed',
};

function createFiles() {
  return createGateway({
    baseURL: BASE_URL,
    apiKey: 'test-key',
    headers: { 'x-provider-header': 'provider' },
  }).files();
}

function prepareJsonResponse(
  url: keyof typeof server.urls,
  body: Record<string, unknown> = fileObject,
) {
  server.urls[url].response = { type: 'json-value', body };
}

function prepareErrorResponse(
  url: keyof typeof server.urls,
  status: number,
  type: string,
  message = 'files error',
) {
  server.urls[url].response = {
    type: 'error',
    status,
    body: JSON.stringify({ error: { message, type } }),
  };
}

async function catchError(promise: PromiseLike<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
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
  it('should be exposed by the provider', () => {
    const files = createFiles();
    expect(files.specificationVersion).toBe('v4');
    expect(files.provider).toBe('gateway.files');
    expect(files.downloadFile).toBeUndefined();
  });

  describe('uploadFile', () => {
    it('should post a multipart upload with purpose user_data', async () => {
      prepareJsonResponse(FILES_URL);

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

    it('should send gateway auth, provider and call headers without an idempotency key', async () => {
      prepareJsonResponse(FILES_URL);

      await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/pdf',
        headers: { 'x-call-header': 'call' },
      });

      const headers = server.calls[0].requestHeaders;
      expect(headers).toMatchObject({
        authorization: 'Bearer test-key',
        'ai-gateway-auth-method': 'api-key',
        'x-provider-header': 'provider',
        'x-call-header': 'call',
      });
      expect(headers).not.toHaveProperty('idempotency-key');
    });

    it('should decode base64 data', async () => {
      prepareJsonResponse(FILES_URL);

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
      prepareJsonResponse(FILES_URL);

      await createFiles().uploadFile({
        data: { type: 'text', text: 'hello' },
        mediaType: 'text/plain',
        filename: 'notes.txt',
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(await (multipart!.file as File).text()).toBe('hello');
    });

    it('should default the filename to "blob"', async () => {
      prepareJsonResponse(FILES_URL);

      await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/pdf',
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect((multipart!.file as File).name).toBe('blob');
    });

    it('should stream a multipart upload', async () => {
      prepareJsonResponse(FILES_URL);

      await createFiles().uploadFile({
        data: { type: 'stream', stream: streamFromChunks(['a,b\n', '1,2\n']) },
        mediaType: 'text/csv',
        filename: 'table.csv',
        providerOptions: { gateway: { expiresAfter: 3600 } },
      });

      expect(server.calls[0].requestHeaders['content-type']).toMatch(
        /^multipart\/form-data; boundary=/,
      );
      const multipart = await server.calls[0].requestBodyMultipart;
      expect(multipart).toMatchObject({
        purpose: 'user_data',
        'expires_after[anchor]': 'created_at',
        'expires_after[seconds]': '3600',
      });
      const file = multipart!.file as File;
      expect(file.name).toBe('table.csv');
      expect(await file.text()).toBe('a,b\n1,2\n');
    });

    it('should send expiresAfter as expiry fields', async () => {
      prepareJsonResponse(FILES_URL);

      await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/pdf',
        providerOptions: { gateway: { expiresAfter: 86400 } },
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(Object.keys(multipart!).sort()).toEqual([
        'expires_after[anchor]',
        'expires_after[seconds]',
        'file',
        'purpose',
      ]);
      expect(multipart).toMatchObject({
        'expires_after[anchor]': 'created_at',
        'expires_after[seconds]': '86400',
      });
    });

    it.each([0, -1, 1.5])(
      'should reject expiresAfter %s before sending a request',
      async expiresAfter => {
        let cancelled = false;
        const stream = new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
          },
        });

        await expect(
          createFiles().uploadFile({
            data: { type: 'stream', stream },
            mediaType: 'application/pdf',
            providerOptions: { gateway: { expiresAfter } },
          }),
        ).rejects.toMatchObject({ name: 'AI_InvalidArgumentError' });

        expect(cancelled).toBe(true);
        expect(server.calls).toHaveLength(0);
      },
    );

    it('should return a gateway provider reference and file details', async () => {
      prepareJsonResponse(FILES_URL);

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
      prepareJsonResponse(FILES_URL, { id: 'gwfile_456' });

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

    it.each([
      [400, 'invalid_request_error', GatewayInvalidRequestError],
      [401, 'authentication_error', GatewayAuthenticationError],
      [429, 'rate_limit_exceeded', GatewayRateLimitError],
      [503, 'internal_server_error', GatewayInternalServerError],
    ])(
      'should map a %i %s response to a gateway error',
      async (status, type, errorClass) => {
        prepareErrorResponse(FILES_URL, status, type);

        const error = await catchError(
          createFiles().uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/pdf',
          }),
        );

        expect(errorClass.isInstance(error)).toBe(true);
        expect(error.statusCode).toBe(status);
      },
    );
  });

  describe('getFileMetadata', () => {
    it('should get the file by its gateway id', async () => {
      prepareJsonResponse(FILE_URL);

      const result = await createFiles().getFileMetadata!({
        file: { openai: 'file-abc', gateway: 'gwfile_123' },
        headers: { 'x-call-header': 'call' },
      });

      expect(server.calls[0].requestMethod).toBe('GET');
      expect(server.calls[0].requestUrl).toBe(FILE_URL);
      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
        'x-call-header': 'call',
      });
      expect(result).toEqual({
        warnings: [],
        providerReference: { gateway: 'gwfile_123' },
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

    it('should encode the file id in the path', async () => {
      prepareJsonResponse(ENCODED_FILE_URL, { id: 'a/b' });

      await createFiles().getFileMetadata!({ file: { gateway: 'a/b' } });

      expect(server.calls[0].requestUrl).toBe(ENCODED_FILE_URL);
    });

    it('should map a not found response to a gateway error', async () => {
      prepareErrorResponse(FILE_URL, 404, 'not_found', 'file not found');

      const error = await catchError(
        createFiles().getFileMetadata!({ file: { gateway: 'gwfile_123' } }),
      );

      expect(GatewayNotFoundError.isInstance(error)).toBe(true);
      expect(error.message).toBe('file not found');
    });

    it('should reject a reference without a gateway file id', async () => {
      await expect(
        createFiles().getFileMetadata!({ file: { openai: 'file-abc' } }),
      ).rejects.toMatchObject({
        name: 'AI_NoSuchProviderReferenceError',
        provider: 'gateway',
      });
      expect(server.calls).toHaveLength(0);
    });
  });

  describe('deleteFile', () => {
    it('should delete the file by its gateway id', async () => {
      prepareJsonResponse(FILE_URL, {
        id: 'gwfile_123',
        object: 'file',
        deleted: true,
      });

      const result = await createFiles().deleteFile!({
        file: { gateway: 'gwfile_123' },
      });

      expect(server.calls[0].requestMethod).toBe('DELETE');
      expect(server.calls[0].requestUrl).toBe(FILE_URL);
      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
      });
      expect(result).toEqual({
        warnings: [],
        providerReference: { gateway: 'gwfile_123' },
        deleted: true,
      });
    });

    it('should map an error response to a gateway error', async () => {
      prepareErrorResponse(FILE_URL, 429, 'rate_limit_exceeded');

      const error = await catchError(
        createFiles().deleteFile!({ file: { gateway: 'gwfile_123' } }),
      );

      expect(GatewayRateLimitError.isInstance(error)).toBe(true);
    });

    it('should reject a reference without a gateway file id', async () => {
      await expect(
        createFiles().deleteFile!({ file: { openai: 'file-abc' } }),
      ).rejects.toMatchObject({
        name: 'AI_NoSuchProviderReferenceError',
        provider: 'gateway',
      });
      expect(server.calls).toHaveLength(0);
    });
  });
});
