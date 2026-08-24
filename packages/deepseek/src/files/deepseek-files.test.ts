import { InvalidArgumentError } from '@ai-sdk/provider';
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

function createFilesWithMockFetch() {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          id: 'file-api-abc123',
          object: 'file',
          bytes: 1024,
          created_at: 1700000000,
          filename: 'image.png',
          purpose: 'user_data',
          expires_at: null,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
  );

  return {
    fetch,
    files: createDeepSeek({
      apiKey: 'test-api-key',
      fetch,
    }).files(),
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
    expect(multipart!.file).toMatchObject({
      name: 'comic-cat.png',
      size: 3,
      type: 'image/png',
    });
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

  it.each([
    {
      format: 'JPEG',
      data: new Uint8Array([0xff, 0xd8, 0xff]),
      mediaType: 'image/jpeg',
      filename: 'image.jpeg',
    },
    {
      format: 'PNG',
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      mediaType: 'image/png',
      filename: 'image.png',
    },
    {
      format: 'GIF',
      data: new Uint8Array([0x47, 0x49, 0x46]),
      mediaType: 'image/gif',
      filename: 'image.gif',
    },
    {
      format: 'WebP',
      data: new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]),
      mediaType: 'image/webp',
      filename: 'image.webp',
    },
  ])('should accept $format uploads', async ({ data, mediaType, filename }) => {
    const { fetch, files } = createFilesWithMockFetch();

    await files.uploadFile({
      data: { type: 'data', data },
      mediaType,
      filename,
    });

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('should accept the image/jpg media type alias', async () => {
    const { fetch, files } = createFilesWithMockFetch();

    const result = await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([0xff, 0xd8]) },
      mediaType: 'image/jpg',
      filename: 'image.jpg',
    });

    const formData = fetch.mock.calls[0][1]?.body as FormData;
    expect(formData.get('file')).toMatchObject({
      name: 'image.jpg',
      type: 'image/jpg',
    });
    expect(result.mediaType).toBe('image/jpg');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('should accept a supported filename when the media type is generic', async () => {
    const { fetch, files } = createFilesWithMockFetch();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/octet-stream',
      filename: 'image.PNG',
    });

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('should accept supported base64-encoded file content', async () => {
    const { fetch, files } = createFilesWithMockFetch();

    await files.uploadFile({
      data: { type: 'data', data: btoa('GIF89a') },
      mediaType: 'application/octet-stream',
    });

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('should accept a file at the 64 MiB size limit', async () => {
    const { fetch, files } = createFilesWithMockFetch();
    const data = new Uint8Array(64 * 1024 * 1024);
    data.set([0x89, 0x50, 0x4e, 0x47]);

    await files.uploadFile({
      data: { type: 'data', data },
      mediaType: 'image/png',
      filename: 'image.png',
    });

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('should accept a filename at the 512-character limit', async () => {
    const { fetch, files } = createFilesWithMockFetch();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'image/png',
      filename: `${'a'.repeat(508)}.png`,
    });

    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'unsupported media type',
      createOptions: () => ({
        data: {
          type: 'data' as const,
          data: new Uint8Array([1, 2, 3]),
        },
        mediaType: 'text/plain',
        filename: 'notes.txt',
      }),
      argument: 'mediaType',
      message: 'Received unsupported media type "text/plain".',
    },
    {
      name: 'unsupported detected file content',
      createOptions: () => ({
        data: {
          type: 'data' as const,
          data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        },
        mediaType: 'image/png',
        filename: 'image.png',
      }),
      argument: 'data',
      message: 'Detected unsupported file content type "application/pdf".',
    },
    {
      name: 'file larger than 64 MiB',
      createOptions: () => ({
        data: {
          type: 'data' as const,
          data: new Uint8Array(64 * 1024 * 1024 + 1),
        },
        mediaType: 'image/png',
        filename: 'image.png',
      }),
      argument: 'data',
      message: 'Received 67,108,865 bytes.',
    },
    {
      name: 'filename longer than 512 characters',
      createOptions: () => ({
        data: {
          type: 'data' as const,
          data: new Uint8Array([1, 2, 3]),
        },
        mediaType: 'image/png',
        filename: `${'a'.repeat(509)}.png`,
      }),
      argument: 'filename',
      message: 'Received 513 characters.',
    },
    {
      name: 'undetectable content without a supported filename',
      createOptions: () => ({
        data: {
          type: 'data' as const,
          data: new Uint8Array([1, 2, 3]),
        },
        mediaType: 'application/octet-stream',
      }),
      argument: 'mediaType',
      message:
        'Provide a supported media type or a filename ending in .jpg, .jpeg, .png, .gif, or .webp.',
    },
  ])(
    'should reject $name without making a fetch call',
    async ({ createOptions, argument, message }) => {
      const { fetch, files } = createFilesWithMockFetch();

      try {
        await files.uploadFile(createOptions());
        expect.fail('Expected uploadFile to reject');
      } catch (error) {
        expect(InvalidArgumentError.isInstance(error)).toBe(true);
        expect(error).toMatchObject({ argument });
        expect((error as Error).message).toContain(message);
      }

      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('should expose the v4 files interface', () => {
    const files = createDeepSeek({ apiKey: 'test-api-key' }).files();

    expect(files.specificationVersion).toBe('v4');
    expect(files.provider).toBe('deepseek.files');
  });
});
