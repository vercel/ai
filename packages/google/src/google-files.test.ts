import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { GoogleFiles } from './google-files';

const defaultFileResource = {
  name: 'files/abc123',
  displayName: 'test-file',
  mimeType: 'application/pdf',
  sizeBytes: '1024',
  createTime: '2025-01-01T00:00:00Z',
  updateTime: '2025-01-01T00:00:00Z',
  expirationTime: '2025-01-02T00:00:00Z',
  sha256Hash: 'abc123hash',
  uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
  state: 'ACTIVE',
};

function createMockFiles({
  fileResource = defaultFileResource,
  uploadUrl = 'https://upload.example.com/resume',
  initStatus = 200,
  uploadStatus = 200,
  pollResponses = [] as Array<{ state: string }>,
  onRequest,
}: {
  fileResource?: typeof defaultFileResource;
  uploadUrl?: string;
  initStatus?: number;
  uploadStatus?: number;
  pollResponses?: Array<{ state: string }>;
  onRequest?: (url: string, init: RequestInit | undefined) => void;
} = {}) {
  let pollIndex = 0;

  const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const urlString = url.toString();
    onRequest?.(urlString, init);

    if (
      urlString.includes('/upload/v1beta/files') &&
      init?.method === 'POST' &&
      (init?.headers as Record<string, string>)?.['X-Goog-Upload-Command'] ===
        'start'
    ) {
      if (initStatus !== 200) {
        return new Response('Init error', { status: initStatus });
      }
      return new Response(null, {
        status: 200,
        headers: { 'x-goog-upload-url': uploadUrl },
      });
    }

    if (urlString === uploadUrl) {
      if (uploadStatus !== 200) {
        return new Response('Upload error', { status: uploadStatus });
      }
      const state =
        pollResponses.length > 0 ? pollResponses[0].state : fileResource.state;
      return new Response(
        JSON.stringify({ file: { ...fileResource, state } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (
      urlString.startsWith('https://generativelanguage.googleapis.com/v1beta/')
    ) {
      pollIndex++;
      const pollState =
        pollIndex < pollResponses.length
          ? pollResponses[pollIndex].state
          : fileResource.state;
      return new Response(
        JSON.stringify({ ...fileResource, state: pollState }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response('Not found', { status: 404 });
  });

  const files = new GoogleFiles({
    provider: 'google.generative-ai',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    headers: () => ({ 'x-goog-api-key': 'test-api-key' }),
    fetch: fetchFn as any,
  });

  return { files, fetchFn };
}

describe('GoogleFiles', () => {
  describe('constructor', () => {
    it('should expose correct provider and specification version', () => {
      const { files } = createMockFiles();
      expect(files.provider).toBe('google.generative-ai');
      expect(files.specificationVersion).toBe('v4');
    });
  });

  describe('uploadFile', () => {
    it('should reject stream data at runtime and cancel the stream', async () => {
      const cancelSpy = vi.fn();
      const stream = new ReadableStream<Uint8Array>({ cancel: cancelSpy });
      const { files, fetchFn } = createMockFiles();

      await expect(
        files.uploadFile({
          data: { type: 'stream', stream },
          mediaType: 'application/pdf',
        }),
      ).rejects.toThrow(UnsupportedFunctionalityError);

      await vi.waitFor(() => expect(cancelSpy).toHaveBeenCalled());
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should thread per-call headers and abortSignal through the upload', async () => {
      const captured: Array<{ url: string; init: RequestInit | undefined }> =
        [];
      const { files } = createMockFiles({
        onRequest: (url, init) => captured.push({ url, init }),
      });
      const controller = new AbortController();

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/pdf',
        abortSignal: controller.signal,
        headers: { 'x-request-id': 'req-1' },
      });

      const initCall = captured.find(({ url }) =>
        url.includes('/upload/v1beta/files'),
      );
      const initHeaders = (initCall?.init?.headers ?? {}) as Record<
        string,
        string
      >;
      expect(initHeaders['x-request-id']).toBe('req-1');
      expect(initCall?.init?.signal).toBe(controller.signal);

      const uploadCall = captured.find(
        ({ url }) => url === 'https://upload.example.com/resume',
      );
      expect(uploadCall?.init?.signal).toBe(controller.signal);
    });

    it('should send correct headers for resumable upload initiation', async () => {
      let capturedInit: RequestInit | undefined;
      const { files } = createMockFiles({
        onRequest: (url, init) => {
          if (url.includes('/upload/v1beta/files')) {
            capturedInit = init;
          }
        },
      });

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/pdf',
      });

      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers['X-Goog-Upload-Protocol']).toBe('resumable');
      expect(headers['X-Goog-Upload-Command']).toBe('start');
      expect(headers['X-Goog-Upload-Header-Content-Length']).toBe('3');
      expect(headers['X-Goog-Upload-Header-Content-Type']).toBe(
        'application/pdf',
      );
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['x-goog-api-key']).toBe('test-api-key');
    });

    it('should include displayName in initiation body when provided', async () => {
      let capturedBody: string | undefined;
      const { files } = createMockFiles({
        onRequest: (url, init) => {
          if (url.includes('/upload/v1beta/files') && init?.body) {
            capturedBody = init.body as string;
          }
        },
      });

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'text/plain',
        providerOptions: {
          google: {
            displayName: 'my-document',
          },
        },
      });

      expect(JSON.parse(capturedBody!)).toEqual({
        file: { display_name: 'my-document' },
      });
    });

    it('should omit displayName from body when not provided', async () => {
      let capturedBody: string | undefined;
      const { files } = createMockFiles({
        onRequest: (url, init) => {
          if (url.includes('/upload/v1beta/files') && init?.body) {
            capturedBody = init.body as string;
          }
        },
      });

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(JSON.parse(capturedBody!)).toEqual({ file: {} });
    });

    it('should send ArrayBuffer-backed data and let fetch derive its content length', async () => {
      let capturedUploadInit: RequestInit | undefined;
      const uploadUrl = 'https://upload.example.com/resume-session';
      const { files } = createMockFiles({
        uploadUrl,
        onRequest: (url, init) => {
          if (url === uploadUrl) {
            capturedUploadInit = init;
          }
        },
      });

      const bytes = new Uint8Array(new SharedArrayBuffer(3));
      bytes.set([10, 20, 30]);

      await files.uploadFile({
        data: { type: 'data', data: bytes },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(capturedUploadInit?.method).toBe('POST');
      const headers = capturedUploadInit?.headers as Record<string, string>;
      expect(headers).not.toHaveProperty('Content-Length');
      expect(headers['X-Goog-Upload-Offset']).toBe('0');
      expect(headers['X-Goog-Upload-Command']).toBe('upload, finalize');

      const body = capturedUploadInit?.body;
      expect(body).toBeInstanceOf(Uint8Array);
      if (!(body instanceof Uint8Array)) {
        throw new Error('Expected upload body to be a Uint8Array');
      }
      expect(body.buffer).toBeInstanceOf(ArrayBuffer);
      expect(Array.from(body)).toEqual([10, 20, 30]);
    });

    it('should preserve ArrayBuffer-backed upload data', async () => {
      let capturedUploadInit: RequestInit | undefined;
      const uploadUrl = 'https://upload.example.com/resume-session';
      const { files } = createMockFiles({
        uploadUrl,
        onRequest: (url, init) => {
          if (url === uploadUrl) {
            capturedUploadInit = init;
          }
        },
      });

      const bytes = new Uint8Array(new ArrayBuffer(5), 1, 3);
      bytes.set([10, 20, 30]);

      await files.uploadFile({
        data: { type: 'data', data: bytes },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(capturedUploadInit?.body).toBe(bytes);
    });

    it('should return providerReference with google key set to file URI', async () => {
      const { files } = createMockFiles();

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(result.providerReference).toEqual({
        google: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
      });
    });

    it('should return empty warnings when filename is not provided', async () => {
      const { files } = createMockFiles();

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(result.warnings).toEqual([]);
    });

    it('should return unsupported warning when filename is provided', async () => {
      const { files } = createMockFiles();

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
        filename: 'test.pdf',
        providerOptions: {},
      });

      expect(result.warnings).toEqual([
        { type: 'unsupported', feature: 'filename' },
      ]);
    });

    it('should return providerMetadata with file details', async () => {
      const { files } = createMockFiles();

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(result.providerMetadata).toEqual({
        google: {
          name: 'files/abc123',
          displayName: 'test-file',
          mimeType: 'application/pdf',
          sizeBytes: '1024',
          state: 'ACTIVE',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
          createTime: '2025-01-01T00:00:00Z',
          updateTime: '2025-01-01T00:00:00Z',
          expirationTime: '2025-01-02T00:00:00Z',
          sha256Hash: 'abc123hash',
        },
      });
    });

    it('should handle base64 string data', async () => {
      let capturedUploadBody: unknown;
      const uploadUrl = 'https://upload.example.com/resume';
      const { files } = createMockFiles({
        uploadUrl,
        onRequest: (url, init) => {
          if (url === uploadUrl) {
            capturedUploadBody = init?.body;
          }
        },
      });

      const base64Data = btoa('hello');
      await files.uploadFile({
        data: { type: 'data', data: base64Data },
        mediaType: 'application/octet-stream',
        providerOptions: {},
      });

      expect(capturedUploadBody).toBeInstanceOf(Uint8Array);
      const decoded = new TextDecoder().decode(
        capturedUploadBody as Uint8Array,
      );
      expect(decoded).toBe('hello');
    });

    describe('polling', () => {
      it.each([
        {
          name: 'files/abc/../../secret',
          expectedPath: 'files%2Fabc%2F..%2F..%2Fsecret',
        },
        { name: 'files/.', expectedPath: 'files/%252E' },
        { name: 'files/..', expectedPath: 'files/%252E%252E' },
        { name: '.', expectedPath: '%252E' },
        { name: '..', expectedPath: '%252E%252E' },
      ])(
        'should preserve $name in the polling URL',
        async ({ name, expectedPath }) => {
          const fileResource = {
            ...defaultFileResource,
            name,
          };
          let pollUrl: string | undefined;
          const { files } = createMockFiles({
            fileResource,
            pollResponses: [{ state: 'PROCESSING' }, { state: 'ACTIVE' }],
            onRequest: url => {
              if (
                url.startsWith(
                  'https://generativelanguage.googleapis.com/v1beta/',
                )
              ) {
                pollUrl = url;
              }
            },
          });

          await files.uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/octet-stream',
            providerOptions: {
              google: { pollIntervalMs: 1 },
            },
          });

          expect(pollUrl).toBe(
            `https://generativelanguage.googleapis.com/v1beta/${expectedPath}`,
          );
        },
      );

      it('should reject promptly when aborted during the polling delay', async () => {
        const { files } = createMockFiles({
          pollResponses: [{ state: 'PROCESSING' }, { state: 'PROCESSING' }],
        });
        const controller = new AbortController();

        // a long interval that only an abort-aware delay can escape
        const uploadPromise = files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1]) },
          mediaType: 'application/octet-stream',
          abortSignal: controller.signal,
          providerOptions: {
            google: { pollIntervalMs: 60_000, pollTimeoutMs: 120_000 },
          },
        });

        setTimeout(() => controller.abort(), 10);

        const start = Date.now();
        await expect(uploadPromise).rejects.toThrow();
        expect(Date.now() - start).toBeLessThan(5000);
      });

      it('should poll until file state becomes ACTIVE', async () => {
        let pollCount = 0;
        const { files, fetchFn } = createMockFiles({
          pollResponses: [
            { state: 'PROCESSING' },
            { state: 'PROCESSING' },
            { state: 'ACTIVE' },
          ],
        });

        const result = await files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1]) },
          mediaType: 'application/octet-stream',
          providerOptions: {
            google: { pollIntervalMs: 10 },
          },
        });

        expect(result.providerReference.google).toBe(defaultFileResource.uri);

        const pollCalls = fetchFn.mock.calls.filter(call =>
          call[0].toString().includes(defaultFileResource.name),
        );
        expect(pollCalls.length).toBeGreaterThanOrEqual(1);
        expect(pollCalls[0]?.[0].toString()).toBe(
          `https://generativelanguage.googleapis.com/v1beta/${defaultFileResource.name}`,
        );
      });

      it('should not poll when file is immediately ACTIVE', async () => {
        const { files, fetchFn } = createMockFiles();

        await files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1]) },
          mediaType: 'application/octet-stream',
          providerOptions: {},
        });

        const pollCalls = fetchFn.mock.calls.filter(
          call =>
            call[0].toString().includes(defaultFileResource.name) &&
            !call[0].toString().includes('/upload/'),
        );
        expect(pollCalls.length).toBe(0);
      });

      it('should throw when file state is FAILED', async () => {
        const failedFileResource = { ...defaultFileResource, state: 'FAILED' };
        const { files } = createMockFiles({
          fileResource: failedFileResource,
        });

        await expect(
          files.uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/octet-stream',
            providerOptions: {},
          }),
        ).rejects.toThrow(/File processing failed/);
      });

      it('should throw on poll timeout', async () => {
        const processingResource = {
          ...defaultFileResource,
          state: 'PROCESSING',
        };

        const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
          const urlString = url.toString();

          if (urlString.includes('/upload/v1beta/files')) {
            return new Response(null, {
              status: 200,
              headers: {
                'x-goog-upload-url': 'https://upload.example.com/resume',
              },
            });
          }

          if (urlString === 'https://upload.example.com/resume') {
            return new Response(
              JSON.stringify({
                file: processingResource,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          return new Response(JSON.stringify(processingResource), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        });

        const files = new GoogleFiles({
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-api-key' }),
          fetch: fetchFn as any,
        });

        await expect(
          files.uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/octet-stream',
            providerOptions: {
              google: {
                pollIntervalMs: 10,
                pollTimeoutMs: 50,
              },
            },
          }),
        ).rejects.toThrow(/timed out/);
      });
    });

    describe('error handling', () => {
      it('should throw when initiation request fails', async () => {
        const { files } = createMockFiles({ initStatus: 500 });

        await expect(
          files.uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/octet-stream',
            providerOptions: {},
          }),
        ).rejects.toThrow(/Failed to initiate resumable upload/);
      });

      it('should throw when no upload URL is returned', async () => {
        const fetchFn = vi.fn(async () => {
          return new Response(null, {
            status: 200,
          });
        });

        const files = new GoogleFiles({
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-api-key' }),
          fetch: fetchFn as any,
        });

        await expect(
          files.uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/octet-stream',
            providerOptions: {},
          }),
        ).rejects.toThrow(/No upload URL/);
      });

      it('should throw when upload request fails', async () => {
        const { files } = createMockFiles({ uploadStatus: 500 });

        await expect(
          files.uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/octet-stream',
            providerOptions: {},
          }),
        ).rejects.toThrow(/Failed to upload file data/);
      });
    });

    describe('provider options', () => {
      it('should accept valid provider options', async () => {
        const { files } = createMockFiles();

        const result = await files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1]) },
          mediaType: 'text/plain',
          providerOptions: {
            google: {
              displayName: 'test',
              pollIntervalMs: 5000,
              pollTimeoutMs: 60000,
            },
          },
        });

        expect(result.providerReference.google).toBeDefined();
      });

      it('should work without provider options', async () => {
        const { files } = createMockFiles();

        const result = await files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1]) },
          mediaType: 'application/octet-stream',
          providerOptions: {},
        });

        expect(result.providerReference.google).toBeDefined();
      });

      it('should pass through unknown properties via passthrough', async () => {
        const { files } = createMockFiles();

        const result = await files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1]) },
          mediaType: 'text/plain',
          providerOptions: {
            google: {
              customField: 'custom-value',
            },
          },
        });

        expect(result.providerReference.google).toBeDefined();
      });
    });

    describe('response metadata', () => {
      it('should omit optional fields from metadata when not present', async () => {
        const minimalFileResource = {
          name: 'files/minimal',
          mimeType: 'text/plain',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/minimal',
          state: 'ACTIVE',
        };

        const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
          const urlString = url.toString();

          if (urlString.includes('/upload/v1beta/files')) {
            return new Response(null, {
              status: 200,
              headers: {
                'x-goog-upload-url': 'https://upload.example.com/resume',
              },
            });
          }

          if (urlString === 'https://upload.example.com/resume') {
            return new Response(JSON.stringify({ file: minimalFileResource }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          return new Response('Not found', { status: 404 });
        });

        const files = new GoogleFiles({
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-api-key' }),
          fetch: fetchFn as any,
        });

        const result = await files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1]) },
          mediaType: 'application/octet-stream',
          providerOptions: {},
        });

        expect(result.providerMetadata?.google).toEqual({
          name: 'files/minimal',
          displayName: undefined,
          mimeType: 'text/plain',
          sizeBytes: undefined,
          state: 'ACTIVE',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/minimal',
        });
        expect(result.providerMetadata?.google).not.toHaveProperty(
          'createTime',
        );
        expect(result.providerMetadata?.google).not.toHaveProperty(
          'expirationTime',
        );
        expect(result.providerMetadata?.google).not.toHaveProperty(
          'sha256Hash',
        );
      });
    });
  });
});
