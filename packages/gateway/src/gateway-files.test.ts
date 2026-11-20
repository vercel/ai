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

const CREATED_AT = '2026-01-01T00:00:00.000Z';
const EXPIRES_AT = '2026-01-31T00:00:00.000Z';

const fileObject = {
  id: 'gwfile_123',
  mediaType: 'application/pdf',
  filename: 'report.pdf',
  byteSize: 3,
  createdAt: CREATED_AT,
  expiresAt: EXPIRES_AT,
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
  {
    status,
    type,
    message = 'files error',
    headers,
  }: {
    status: number;
    type: string;
    message?: string;
    headers?: Record<string, string>;
  },
) {
  server.urls[url].response = {
    type: 'error',
    status,
    headers,
    body: JSON.stringify({ error: { message, type, param: null } }),
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
    it('should post the file and filename as multipart form data', async () => {
      prepareJsonResponse(FILES_URL);

      await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/pdf',
        filename: 'report.pdf',
      });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(FILES_URL);

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(Object.keys(multipart!).sort()).toEqual(['file', 'filename']);
      expect(multipart!.filename).toBe('report.pdf');
      const file = multipart!.file as File;
      expect(file.type).toBe('application/octet-stream');
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3]),
      );
    });

    it('should omit the filename field when no filename is given', async () => {
      prepareJsonResponse(FILES_URL);

      await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/pdf',
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(Object.keys(multipart!)).toEqual(['file']);
    });

    it('should send gateway auth, protocol, provider and call headers without an idempotency key', async () => {
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
        'ai-gateway-protocol-version': '0.0.1',
        'x-provider-header': 'provider',
        'x-call-header': 'call',
      });
      expect(headers).not.toHaveProperty('idempotency-key');
    });

    it('should decode base64 data', async () => {
      prepareJsonResponse(FILES_URL);

      await createFiles().uploadFile({
        data: { type: 'data', data: 'AQID' },
        mediaType: 'application/pdf',
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
      expect(Object.keys(multipart!).sort()).toEqual([
        'expiresAfter',
        'file',
        'filename',
      ]);
      expect(multipart).toMatchObject({
        filename: 'table.csv',
        expiresAfter: '3600',
      });
      expect(await (multipart!.file as File).text()).toBe('a,b\n1,2\n');
    });

    it('should send expiresAfter as a field', async () => {
      prepareJsonResponse(FILES_URL);

      await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/pdf',
        providerOptions: { gateway: { expiresAfter: 86400 } },
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(Object.keys(multipart!).sort()).toEqual(['expiresAfter', 'file']);
      expect(multipart!.expiresAfter).toBe('86400');
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

    it('should return a gateway provider reference and the stored file details', async () => {
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
        createdAt: new Date(CREATED_AT),
        expiresAt: new Date(EXPIRES_AT),
      });
    });

    it('should fall back to the request media type and filename and omit missing fields', async () => {
      prepareJsonResponse(FILES_URL, {
        id: 'gwfile_456',
        createdAt: 'not a date',
      });

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
      });
    });

    it('should warn when the stored media type differs from the declared one', async () => {
      prepareJsonResponse(FILES_URL, { ...fileObject, mediaType: 'image/png' });

      const result = await createFiles().uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'image/jpeg',
      });

      expect(result.mediaType).toBe('image/png');
      expect(result.warnings).toEqual([
        {
          type: 'other',
          message:
            "AI Gateway detected the file as 'image/png' instead of the declared 'image/jpeg'.",
        },
      ]);
    });

    it.each([
      ['text/plain; charset=utf-8', 'TEXT/PLAIN'],
      ['application/octet-stream', 'application/pdf'],
    ])(
      'should not warn for declared %s and stored %s',
      async (declared, stored) => {
        prepareJsonResponse(FILES_URL, { ...fileObject, mediaType: stored });

        const result = await createFiles().uploadFile({
          data: { type: 'data', data: new Uint8Array([1]) },
          mediaType: declared,
        });

        expect(result.warnings).toEqual([]);
      },
    );

    it.each([
      [400, 'invalid_request_error', GatewayInvalidRequestError],
      [401, 'authentication_error', GatewayAuthenticationError],
      [429, 'rate_limit_exceeded', GatewayRateLimitError],
      [503, 'service_unavailable_error', GatewayInternalServerError],
    ])(
      'should map a %i %s response to a gateway error',
      async (status, type, errorClass) => {
        prepareErrorResponse(FILES_URL, { status, type });

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

    it.each([
      [409, 'invalid_request_error', 'false', false],
      [408, 'timeout', 'false', false],
      [503, 'service_unavailable_error', 'false', false],
      [503, 'service_unavailable_error', 'true', true],
      [400, 'invalid_request_error', 'true', true],
    ])(
      'should take retryability of a %i %s from x-should-retry: %s',
      async (status, type, shouldRetry, isRetryable) => {
        prepareErrorResponse(FILES_URL, {
          status,
          type,
          headers: { 'x-should-retry': shouldRetry },
        });

        const error = await catchError(
          createFiles().uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/pdf',
          }),
        );

        expect(error.statusCode).toBe(status);
        expect(error.isRetryable).toBe(isRetryable);
      },
    );

    it('should derive retryability from the status without x-should-retry', async () => {
      prepareErrorResponse(FILES_URL, {
        status: 429,
        type: 'rate_limit_exceeded',
      });

      const error = await catchError(
        createFiles().uploadFile({
          data: { type: 'data', data: new Uint8Array([1]) },
          mediaType: 'application/pdf',
        }),
      );

      expect(error.isRetryable).toBe(true);
    });
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
        'ai-gateway-protocol-version': '0.0.1',
        'x-call-header': 'call',
      });
      expect(result).toEqual({
        warnings: [],
        providerReference: { gateway: 'gwfile_123' },
        mediaType: 'application/pdf',
        filename: 'report.pdf',
        byteSize: 3,
        createdAt: new Date(CREATED_AT),
        expiresAt: new Date(EXPIRES_AT),
      });
    });

    it('should encode the file id in the path', async () => {
      prepareJsonResponse(ENCODED_FILE_URL, { id: 'a/b' });

      await createFiles().getFileMetadata!({ file: { gateway: 'a/b' } });

      expect(server.calls[0].requestUrl).toBe(ENCODED_FILE_URL);
    });

    it('should map a not found response to a gateway error', async () => {
      prepareErrorResponse(FILE_URL, {
        status: 404,
        type: 'not_found',
        message: 'file not found',
        headers: { 'x-should-retry': 'false' },
      });

      const error = await catchError(
        createFiles().getFileMetadata!({ file: { gateway: 'gwfile_123' } }),
      );

      expect(GatewayNotFoundError.isInstance(error)).toBe(true);
      expect(error.message).toBe('file not found');
      expect(error.isRetryable).toBe(false);
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
      prepareJsonResponse(FILE_URL, { id: 'gwfile_123', deleted: true });

      const result = await createFiles().deleteFile!({
        file: { gateway: 'gwfile_123' },
      });

      expect(server.calls[0].requestMethod).toBe('DELETE');
      expect(server.calls[0].requestUrl).toBe(FILE_URL);
      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
        'ai-gateway-protocol-version': '0.0.1',
      });
      expect(result).toEqual({
        warnings: [],
        providerReference: { gateway: 'gwfile_123' },
        deleted: true,
      });
    });

    it('should not retry a conflict marked x-should-retry: false', async () => {
      prepareErrorResponse(FILE_URL, {
        status: 409,
        type: 'invalid_request_error',
        message: 'file is on hold',
        headers: { 'x-should-retry': 'false' },
      });

      const error = await catchError(
        createFiles().deleteFile!({ file: { gateway: 'gwfile_123' } }),
      );

      expect(GatewayInvalidRequestError.isInstance(error)).toBe(true);
      expect(error.statusCode).toBe(409);
      expect(error.isRetryable).toBe(false);
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
