import { APICallError, TypeValidationError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const server = createTestServer({
  'https://api.deepseek.com/files': {},
});

function prepareFileResponse({
  body,
  id = 'file-api-abc123',
  expiresAt = null,
}: {
  body?: Record<string, unknown>;
  id?: string;
  expiresAt?: number | null;
} = {}) {
  server.urls['https://api.deepseek.com/files'].response = {
    type: 'json-value',
    body:
      body ??
      ({
        id,
        object: 'file',
        bytes: 1024,
        created_at: 1700000000,
        filename: 'comic-cat.png',
        purpose: 'user_data',
        expires_at: expiresAt,
      } satisfies Record<string, unknown>),
  };
}

async function expectInvalidResponseField(
  upload: PromiseLike<unknown>,
  field: string,
) {
  let error: unknown;
  try {
    await upload;
  } catch (caughtError) {
    error = caughtError;
  }

  expect(APICallError.isInstance(error)).toBe(true);
  if (!APICallError.isInstance(error)) {
    throw error;
  }

  expect(error.message).toBe('Invalid JSON response');
  expect(TypeValidationError.isInstance(error.cause)).toBe(true);
  if (!TypeValidationError.isInstance(error.cause)) {
    throw error.cause;
  }

  expect(error.cause.message).toContain(`"${field}"`);
}

describe('DeepSeek Files - uploadFile', () => {
  it('should upload an image with the user_data purpose', async () => {
    prepareFileResponse();

    const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'image/png',
      filename: 'comic-cat.png',
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart).toMatchObject({ purpose: 'user_data' });
    expect(multipart!.file).toBeDefined();
  });

  it('should return a DeepSeek provider reference and response metadata', async () => {
    prepareFileResponse({
      id: 'file-api-xyz789',
      expiresAt: 1700003600,
    });

    const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

    const result = await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'image/png',
      filename: 'comic-cat.png',
    });

    expect(result).toEqual({
      warnings: [],
      providerReference: { deepseek: 'file-api-xyz789' },
      filename: 'comic-cat.png',
      mediaType: 'image/png',
      providerMetadata: {
        deepseek: {
          filename: 'comic-cat.png',
          purpose: 'user_data',
          bytes: 1024,
          createdAt: 1700000000,
          expiresAt: 1700003600,
        },
      },
    });
  });

  it.each([
    {
      name: 'omitted',
      body: {
        id: 'file-api-incomplete',
      },
    },
    {
      name: 'null',
      body: {
        id: 'file-api-incomplete',
        object: null,
        bytes: null,
        created_at: null,
        filename: null,
        purpose: null,
        expires_at: null,
      },
    },
  ])(
    'should tolerate $name optional response metadata and fall back to the request filename',
    async ({ body }) => {
      prepareFileResponse({ body });

      const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'image/png',
        filename: 'request-filename.png',
      });

      expect(result).toEqual({
        warnings: [],
        providerReference: { deepseek: 'file-api-incomplete' },
        filename: 'request-filename.png',
        mediaType: 'image/png',
        providerMetadata: {
          deepseek: {},
        },
      });
    },
  );

  it.each([
    ['object', 'document'],
    ['purpose', 'assistants'],
    ['bytes', -1],
    ['bytes', 1.5],
    ['created_at', -1],
    ['created_at', 1.5],
    ['filename', 123],
  ])(
    'should reject an invalid %s response field',
    async (field, invalidValue) => {
      prepareFileResponse({
        body: {
          id: 'file-api-invalid',
          object: 'file',
          bytes: 1024,
          created_at: 1700000000,
          filename: 'comic-cat.png',
          purpose: 'user_data',
          [field]: invalidValue,
        },
      });

      const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

      await expectInvalidResponseField(
        files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
          mediaType: 'image/png',
        }),
        field,
      );
    },
  );

  it('should reject a response without a file id', async () => {
    prepareFileResponse({
      body: {
        object: 'file',
        bytes: 1024,
        created_at: 1700000000,
        filename: 'comic-cat.png',
        purpose: 'user_data',
      },
    });

    const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

    await expectInvalidResponseField(
      files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'image/png',
      }),
      'id',
    );
  });

  it('should pass expires_after as bracketed multipart fields', async () => {
    prepareFileResponse();

    const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'image/png',
      providerOptions: {
        deepseek: { expiresAfter: 3600 },
      },
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart).toMatchObject({
      'expires_after[anchor]': 'created_at',
      'expires_after[seconds]': '3600',
    });
    expect(multipart).not.toHaveProperty('expires_after');
  });

  it('should omit expires_after fields when no expiry is requested', async () => {
    prepareFileResponse();

    const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'image/png',
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart).not.toHaveProperty('expires_after[anchor]');
    expect(multipart).not.toHaveProperty('expires_after[seconds]');
  });

  it('should reject an expiry outside the supported range', async () => {
    prepareFileResponse();

    const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

    await expect(
      files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'image/png',
        providerOptions: {
          deepseek: { expiresAfter: 3599 },
        },
      }),
    ).rejects.toThrow();
  });

  it('should pass authentication and custom headers', async () => {
    prepareFileResponse();

    const files = createDeepSeek({
      apiKey: 'test-api-key',
      headers: { 'Custom-Header': 'custom-value' },
    }).files();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'image/png',
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'custom-header': 'custom-value',
    });
  });

  it('should handle base64-encoded data', async () => {
    prepareFileResponse();

    const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

    const result = await files.uploadFile({
      data: { type: 'data', data: btoa('image bytes') },
      mediaType: 'image/png',
    });

    expect(result.providerReference).toEqual({
      deepseek: 'file-api-abc123',
    });
  });

  it('should expose the v4 files interface', () => {
    const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

    expect(files.specificationVersion).toBe('v4');
    expect(files.provider).toBe('deepseek.files');
  });
});
