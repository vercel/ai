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
  id = 'file-api-abc123',
  expiresAt = null,
}: {
  id?: string;
  expiresAt?: number | null;
} = {}) {
  server.urls['https://api.deepseek.com/files'].response = {
    type: 'json-value',
    body: {
      id,
      object: 'file',
      bytes: 1024,
      created_at: 1700000000,
      filename: 'comic-cat.png',
      purpose: 'user_data',
      expires_at: expiresAt,
    },
  };
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
