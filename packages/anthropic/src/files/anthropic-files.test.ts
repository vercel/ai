import {
  TypeValidationError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicFiles } from './anthropic-files';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const server = createTestServer({
  'https://api.anthropic.com/v1/files': {},
  'https://api.anthropic.com/v1/files/file-abc123': {},
  'https://api.anthropic.com/v1/files/file-abc123/content': {},
});

const createFiles = (options?: { headers?: Record<string, string> }) =>
  new AnthropicFiles({
    provider: 'anthropic.files',
    baseURL: 'https://api.anthropic.com/v1',
    headers: () => ({
      'x-api-key': 'test-api-key',
      'anthropic-version': '2023-06-01',
      ...options?.headers,
    }),
  });

const successfulResponse = {
  type: 'json-value' as const,
  body: {
    id: 'file-abc123',
    type: 'file',
    filename: 'test.pdf',
    mime_type: 'application/pdf',
    size_bytes: 12345,
    created_at: '2025-04-14T12:00:00Z',
    downloadable: true,
  },
};

describe('AnthropicFiles', () => {
  describe('uploadFile', () => {
    it('sends POST to /v1/files with correct beta header', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response =
        successfulResponse;

      const files = createFiles();
      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(server.calls.length).toBe(1);
      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.anthropic.com/v1/files',
      );
      expect(server.calls[0].requestHeaders['anthropic-beta']).toBe(
        'files-api-2025-04-14',
      );
    });

    it('rejects stream data at runtime and cancels the stream', async () => {
      const cancelSpy = vi.fn();
      const stream = new ReadableStream<Uint8Array>({ cancel: cancelSpy });

      const files = createFiles();
      await expect(
        files.uploadFile({
          data: { type: 'stream', stream },
          mediaType: 'application/octet-stream',
          providerOptions: {},
        }),
      ).rejects.toThrow(UnsupportedFunctionalityError);

      await vi.waitFor(() => expect(cancelSpy).toHaveBeenCalled());
      expect(server.calls.length).toBe(0);
    });

    it('threads per-call headers and abortSignal', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response =
        successfulResponse;

      const files = createFiles();
      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        headers: { 'x-request-id': 'req-1' },
        providerOptions: {},
      });

      expect(server.calls[0].requestHeaders['x-request-id']).toBe('req-1');

      const controller = new AbortController();
      controller.abort();
      await expect(
        files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
          mediaType: 'application/octet-stream',
          abortSignal: controller.signal,
          providerOptions: {},
        }),
      ).rejects.toThrow();
    });

    it('sends x-api-key header', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response =
        successfulResponse;

      const files = createFiles();
      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(server.calls[0].requestHeaders['x-api-key']).toBe('test-api-key');
    });

    it('sends multipart form data with file', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response =
        successfulResponse;

      const files = createFiles();
      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(multipart).not.toBeNull();
      expect(multipart!.file).toBeDefined();
    });

    it('uses default filename "blob" when not specified', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response =
        successfulResponse;

      const files = createFiles();
      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      const file = multipart!.file as File;
      expect(file.name).toBe('blob');
    });

    it('uses custom filename from spec options', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response =
        successfulResponse;

      const files = createFiles();
      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        filename: 'custom-name.pdf',
        providerOptions: {},
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      const file = multipart!.file as File;
      expect(file.name).toBe('custom-name.pdf');
    });

    it('uses mediaType from spec options', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response =
        successfulResponse;

      const files = createFiles();
      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/pdf',
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      const file = multipart!.file as File;
      expect(file.type).toBe('application/pdf');
    });

    it('returns providerReference with anthropic key set to file ID', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response =
        successfulResponse;

      const files = createFiles();
      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(result.providerReference).toEqual({ anthropic: 'file-abc123' });
    });

    it('returns providerMetadata with response data', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response =
        successfulResponse;

      const files = createFiles();
      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(result.providerMetadata).toEqual({
        anthropic: {
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12345,
          createdAt: '2025-04-14T12:00:00Z',
          downloadable: true,
        },
      });
    });

    it('omits downloadable from providerMetadata when null', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response = {
        type: 'json-value',
        body: {
          id: 'file-abc123',
          type: 'file',
          filename: 'test.pdf',
          mime_type: 'application/pdf',
          size_bytes: 12345,
          created_at: '2025-04-14T12:00:00Z',
          downloadable: null,
        },
      };

      const files = createFiles();
      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(result.providerMetadata!.anthropic).not.toHaveProperty(
        'downloadable',
      );
    });

    it('handles base64 string data', async () => {
      server.urls['https://api.anthropic.com/v1/files'].response =
        successfulResponse;

      const files = createFiles();
      const result = await files.uploadFile({
        data: { type: 'data', data: 'AQID' },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(result.providerReference).toEqual({ anthropic: 'file-abc123' });
    });

    it('has specificationVersion v4', () => {
      const files = createFiles();
      expect(files.specificationVersion).toBe('v4');
    });

    it('has correct provider name', () => {
      const files = createFiles();
      expect(files.provider).toBe('anthropic.files');
    });
  });

  describe('deleteFile', () => {
    it('should delete a file via DELETE', async () => {
      server.urls['https://api.anthropic.com/v1/files/file-abc123'].response = {
        type: 'json-value',
        body: { id: 'file-abc123', type: 'file_deleted' },
      };

      const files = createFiles();
      const result = await files.deleteFile({
        file: { anthropic: 'file-abc123' },
      });

      expect(server.calls[0].requestMethod).toBe('DELETE');
      expect(result.deleted).toBe(true);
      expect(result.providerReference).toEqual({ anthropic: 'file-abc123' });
    });

    it('should handle delete response without type field', async () => {
      server.urls['https://api.anthropic.com/v1/files/file-abc123'].response = {
        type: 'json-value',
        body: { id: 'file-abc123' },
      };

      const files = createFiles();
      const result = await files.deleteFile({
        file: { anthropic: 'file-abc123' },
      });

      expect(result.deleted).toBe(false);
      expect(result.providerReference).toEqual({ anthropic: 'file-abc123' });
    });

    it('should reject a blank anthropic file id', async () => {
      const files = createFiles();

      await expect(
        files.deleteFile({ file: { anthropic: '' } }),
      ).rejects.toThrow("file reference is missing an 'anthropic' file id.");
    });

    it('should reject a whitespace-only anthropic file id', async () => {
      const files = createFiles();

      await expect(
        files.deleteFile({ file: { anthropic: '   ' } }),
      ).rejects.toThrow("file reference is missing an 'anthropic' file id.");
    });

    it('should reject a reference without an anthropic file id', async () => {
      const files = createFiles();

      await expect(
        files.deleteFile({ file: { other: 'file-abc123' } }),
      ).rejects.toThrow("file reference is missing an 'anthropic' file id.");
    });

    it('should send anthropic-beta header', async () => {
      server.urls['https://api.anthropic.com/v1/files/file-abc123'].response = {
        type: 'json-value',
        body: { id: 'file-abc123', type: 'file_deleted' },
      };

      const files = createFiles();
      await files.deleteFile({ file: { anthropic: 'file-abc123' } });

      expect(server.calls[0].requestHeaders['anthropic-beta']).toBe(
        'files-api-2025-04-14',
      );
    });

    it('should support abortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const files = createFiles();
      await expect(
        files.deleteFile({
          file: { anthropic: 'file-abc123' },
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow();
    });

    it.each([
      { fileId: '.', encodedFileId: '%252E' },
      { fileId: '..', encodedFileId: '%252E%252E' },
    ])(
      'should preserve dot-segment file id $fileId as a URL path segment',
      async ({ fileId, encodedFileId }) => {
        const requestUrls: string[] = [];
        const files = new AnthropicFiles({
          provider: 'anthropic.files',
          baseURL: 'https://api.anthropic.com/v1',
          headers: () => ({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          }),
          fetch: async input => {
            requestUrls.push(
              new Request(
                typeof input === 'string'
                  ? input
                  : input instanceof URL
                    ? input.href
                    : input,
              ).url,
            );

            return new Response(JSON.stringify({ id: fileId }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          },
        });

        await files.deleteFile({ file: { anthropic: fileId } });

        expect(requestUrls).toEqual([
          `https://api.anthropic.com/v1/files/${encodedFileId}`,
        ]);
      },
    );
  });

  describe('getFileMetadata', () => {
    it('should retrieve file metadata via GET', async () => {
      server.urls['https://api.anthropic.com/v1/files/file-abc123'].response = {
        type: 'json-value',
        body: {
          id: 'file-abc123',
          type: 'file',
          filename: 'test.pdf',
          mime_type: 'application/pdf',
          size_bytes: 12345,
          created_at: '2025-04-14T12:00:00Z',
          downloadable: true,
        },
      };

      const files = createFiles();
      const result = await files.getFileMetadata({
        file: { anthropic: 'file-abc123' },
      });

      expect(server.calls[0].requestMethod).toBe('GET');
      expect(result.providerReference).toEqual({ anthropic: 'file-abc123' });
      expect(result.filename).toBe('test.pdf');
      expect(result.byteSize).toBe(12345);
      expect(result.createdAt).toEqual(new Date('2025-04-14T12:00:00Z'));
      expect(result.providerMetadata).toEqual({
        anthropic: {
          id: 'file-abc123',
          type: 'file',
          filename: 'test.pdf',
          mime_type: 'application/pdf',
          size_bytes: 12345,
          created_at: '2025-04-14T12:00:00Z',
          downloadable: true,
        },
      });
    });

    it('should handle metadata without downloadable field', async () => {
      server.urls['https://api.anthropic.com/v1/files/file-abc123'].response = {
        type: 'json-value',
        body: {
          id: 'file-abc123',
          type: 'file',
          filename: 'test.pdf',
          mime_type: 'application/pdf',
          size_bytes: 12345,
          created_at: '2025-04-14T12:00:00Z',
        },
      };

      const files = createFiles();
      const result = await files.getFileMetadata({
        file: { anthropic: 'file-abc123' },
      });

      expect(result.providerMetadata!.anthropic).not.toHaveProperty(
        'downloadable',
      );
    });

    it('should handle metadata without created_at field', async () => {
      server.urls['https://api.anthropic.com/v1/files/file-abc123'].response = {
        type: 'json-value',
        body: {
          id: 'file-abc123',
          type: 'file',
          filename: 'test.pdf',
          mime_type: 'application/pdf',
          size_bytes: 12345,
        },
      };

      const files = createFiles();
      await expect(
        files.getFileMetadata({
          file: { anthropic: 'file-abc123' },
        }),
      ).rejects.toThrow();
    });

    it('should reject a blank anthropic file id', async () => {
      const files = createFiles();

      await expect(
        files.getFileMetadata({ file: { anthropic: '' } }),
      ).rejects.toThrow("file reference is missing an 'anthropic' file id.");
    });

    it('should reject a whitespace-only anthropic file id', async () => {
      const files = createFiles();

      await expect(
        files.getFileMetadata({ file: { anthropic: '   ' } }),
      ).rejects.toThrow("file reference is missing an 'anthropic' file id.");
    });

    it('should reject a reference without an anthropic file id', async () => {
      const files = createFiles();

      await expect(
        files.getFileMetadata({ file: { other: 'file-abc123' } }),
      ).rejects.toThrow("file reference is missing an 'anthropic' file id.");
    });

    it('should send anthropic-beta header', async () => {
      server.urls['https://api.anthropic.com/v1/files/file-abc123'].response = {
        type: 'json-value',
        body: {
          id: 'file-abc123',
          type: 'file',
          filename: 'test.pdf',
          mime_type: 'application/pdf',
          size_bytes: 12345,
          created_at: '2025-04-14T12:00:00Z',
        },
      };

      const files = createFiles();
      await files.getFileMetadata({ file: { anthropic: 'file-abc123' } });

      expect(server.calls[0].requestHeaders['anthropic-beta']).toBe(
        'files-api-2025-04-14',
      );
    });

    it('should support abortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const files = createFiles();
      await expect(
        files.getFileMetadata({
          file: { anthropic: 'file-abc123' },
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow();
    });

    it.each([
      { fileId: '.', encodedFileId: '%252E' },
      { fileId: '..', encodedFileId: '%252E%252E' },
    ])(
      'should preserve dot-segment file id $fileId as a URL path segment',
      async ({ fileId, encodedFileId }) => {
        const requestUrls: string[] = [];
        const files = new AnthropicFiles({
          provider: 'anthropic.files',
          baseURL: 'https://api.anthropic.com/v1',
          headers: () => ({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          }),
          fetch: async input => {
            requestUrls.push(
              new Request(
                typeof input === 'string'
                  ? input
                  : input instanceof URL
                    ? input.href
                    : input,
              ).url,
            );

            return new Response(
              JSON.stringify({
                id: fileId,
                type: 'file',
                filename: 'test.pdf',
                mime_type: 'application/pdf',
                size_bytes: 12345,
                created_at: '2025-04-14T12:00:00Z',
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            );
          },
        });

        await files.getFileMetadata({ file: { anthropic: fileId } });

        expect(requestUrls).toEqual([
          `https://api.anthropic.com/v1/files/${encodedFileId}`,
        ]);
      },
    );
  });

  describe('downloadFile', () => {
    it('should download file content as a stream', async () => {
      server.urls[
        'https://api.anthropic.com/v1/files/file-abc123/content'
      ].response = {
        type: 'binary',
        body: Buffer.from('test file content'),
      };

      const files = createFiles();
      const result = await files.downloadFile({
        file: { anthropic: 'file-abc123' },
      });

      expect(server.calls[0].requestMethod).toBe('GET');
      expect(result.content).toBeInstanceOf(ReadableStream);
      expect(await new Response(result.content).text()).toBe(
        'test file content',
      );
    });

    it('should expose the response content type as mediaType (parameters stripped)', async () => {
      server.urls[
        'https://api.anthropic.com/v1/files/file-abc123/content'
      ].response = {
        type: 'binary',
        headers: { 'content-type': 'application/pdf; charset=utf-8' },
        body: Buffer.from('test file content'),
      };

      const files = createFiles();
      const result = await files.downloadFile({
        file: { anthropic: 'file-abc123' },
      });

      expect(result.mediaType).toBe('application/pdf');
    });

    it('should handle missing content-type header', async () => {
      server.urls[
        'https://api.anthropic.com/v1/files/file-abc123/content'
      ].response = {
        type: 'binary',
        body: Buffer.from('test file content'),
      };

      const files = createFiles();
      const result = await files.downloadFile({
        file: { anthropic: 'file-abc123' },
      });

      expect(result.mediaType).toBe('application/octet-stream');
    });

    it('should reject a blank anthropic file id', async () => {
      const files = createFiles();

      await expect(
        files.downloadFile({ file: { anthropic: '' } }),
      ).rejects.toThrow("file reference is missing an 'anthropic' file id.");
    });

    it('should reject a whitespace-only anthropic file id', async () => {
      const files = createFiles();

      await expect(
        files.downloadFile({ file: { anthropic: '   ' } }),
      ).rejects.toThrow("file reference is missing an 'anthropic' file id.");
    });

    it('should reject a reference without an anthropic file id', async () => {
      const files = createFiles();

      await expect(
        files.downloadFile({ file: { other: 'file-abc123' } }),
      ).rejects.toThrow("file reference is missing an 'anthropic' file id.");
    });

    it('should send anthropic-beta header', async () => {
      server.urls[
        'https://api.anthropic.com/v1/files/file-abc123/content'
      ].response = {
        type: 'binary',
        body: Buffer.from('test file content'),
      };

      const files = createFiles();
      await files.downloadFile({ file: { anthropic: 'file-abc123' } });

      expect(server.calls[0].requestHeaders['anthropic-beta']).toBe(
        'files-api-2025-04-14',
      );
    });

    it('should support abortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const files = createFiles();
      await expect(
        files.downloadFile({
          file: { anthropic: 'file-abc123' },
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow();
    });

    it.each([
      { fileId: '.', encodedFileId: '%252E' },
      { fileId: '..', encodedFileId: '%252E%252E' },
    ])(
      'should preserve dot-segment file id $fileId as a URL path segment',
      async ({ fileId, encodedFileId }) => {
        const requestUrls: string[] = [];
        const files = new AnthropicFiles({
          provider: 'anthropic.files',
          baseURL: 'https://api.anthropic.com/v1',
          headers: () => ({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          }),
          fetch: async input => {
            requestUrls.push(
              new Request(
                typeof input === 'string'
                  ? input
                  : input instanceof URL
                    ? input.href
                    : input,
              ).url,
            );

            return new Response('test file content', {
              status: 200,
              headers: { 'content-type': 'application/pdf' },
            });
          },
        });

        await files.downloadFile({ file: { anthropic: fileId } });

        expect(requestUrls).toEqual([
          `https://api.anthropic.com/v1/files/${encodedFileId}/content`,
        ]);
      },
    );
  });
});
