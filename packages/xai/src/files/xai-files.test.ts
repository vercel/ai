import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XaiFiles } from './xai-files';

const mockFetchResponse = ({
  body,
  status = 200,
}: {
  body: object;
  status?: number;
}) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

const defaultResponseBody = {
  id: 'file-abc123',
  object: 'file',
  bytes: 3,
  created_at: 1234567890,
  filename: 'upload',
};

describe('XaiFiles', () => {
  let mockHeaders: () => Record<string, string | undefined>;

  beforeEach(() => {
    mockHeaders = () => ({
      Authorization: 'Bearer test-key',
    });
  });

  describe('uploadFile', () => {
    it('should send a multipart POST to /v1/files', async () => {
      const fetchMock = mockFetchResponse({ body: defaultResponseBody });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
      });

      expect(fetchMock).toHaveBeenCalledOnce();

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.x.ai/v1/files');
      expect(options.method).toBe('POST');

      const body = options.body as FormData;
      expect(body.get('file')).toBeInstanceOf(Blob);
    });

    it('should return providerReference with xai key set to id', async () => {
      const fetchMock = mockFetchResponse({
        body: { ...defaultResponseBody, id: 'file-xyz789' },
      });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
      });

      expect(result.providerReference).toEqual({ xai: 'file-xyz789' });
    });

    it('should include providerMetadata with response data', async () => {
      const fetchMock = mockFetchResponse({
        body: {
          id: 'file-abc123',
          object: 'file',
          bytes: 512,
          created_at: 1700000000,
          filename: 'data.csv',
        },
      });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
      });

      expect(result.providerMetadata).toEqual({
        xai: {
          filename: 'data.csv',
          bytes: 512,
          createdAt: 1700000000,
        },
      });
    });

    it('should pass custom filename when provided', async () => {
      const fetchMock = mockFetchResponse({ body: defaultResponseBody });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        filename: 'custom-name.pdf',
      });

      const [, options] = fetchMock.mock.calls[0];
      const body = options.body as FormData;
      const file = body.get('file') as File;
      expect(file.name).toBe('custom-name.pdf');
    });

    it('should use default filename "blob" when not provided', async () => {
      const fetchMock = mockFetchResponse({ body: defaultResponseBody });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
      });

      const [, options] = fetchMock.mock.calls[0];
      const body = options.body as FormData;
      const file = body.get('file') as File;
      expect(file.name).toBe('blob');
    });

    it('should pass teamId as team_id when provided', async () => {
      const fetchMock = mockFetchResponse({ body: defaultResponseBody });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
        providerOptions: {
          xai: { teamId: 'team-123' },
        },
      });

      const [, options] = fetchMock.mock.calls[0];
      const body = options.body as FormData;
      expect(body.get('team_id')).toBe('team-123');
    });

    it('should not include team_id when not provided', async () => {
      const fetchMock = mockFetchResponse({ body: defaultResponseBody });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
      });

      const [, options] = fetchMock.mock.calls[0];
      const body = options.body as FormData;
      expect(body.get('team_id')).toBeNull();
    });

    it('should convert base64 string data to bytes', async () => {
      const fetchMock = mockFetchResponse({ body: defaultResponseBody });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      await files.uploadFile({
        data: { type: 'data', data: 'dGVzdA==' },
        mediaType: 'application/octet-stream',
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [, options] = fetchMock.mock.calls[0];
      const body = options.body as FormData;
      const file = body.get('file') as Blob;
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      expect(Array.from(bytes)).toEqual([116, 101, 115, 116]);
    });

    it('should omit null response fields from providerMetadata', async () => {
      const fetchMock = mockFetchResponse({
        body: {
          id: 'file-abc123',
          object: 'file',
          bytes: null,
          created_at: null,
          filename: null,
        },
      });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
      });

      expect(result.providerMetadata).toEqual({ xai: {} });
    });

    it('should return empty warnings array', async () => {
      const fetchMock = mockFetchResponse({ body: defaultResponseBody });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
      });

      expect(result.warnings).toEqual([]);
    });

    it('should have specificationVersion v4', () => {
      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
      });

      expect(files.specificationVersion).toBe('v4');
    });

    it('should have the correct provider name', () => {
      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
      });

      expect(files.provider).toBe('xai.files');
    });

    it('should append expires_after before the file part', async () => {
      const fetchMock = mockFetchResponse({
        body: { ...defaultResponseBody, expires_at: 1234740690 },
      });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        providerOptions: { xai: { expiresAfter: 172800 } },
      });

      const [, options] = fetchMock.mock.calls[0];
      const body = options.body as FormData;
      expect(body.get('expires_after')).toBe('172800');
      // xAI rejects uploads where expires_after arrives after the file part
      expect([...body.keys()]).toEqual(['expires_after', 'file']);
      expect(result.providerMetadata).toEqual({
        xai: expect.objectContaining({ expiresAt: 1234740690 }),
      });
      expect(result.expiresAt).toEqual(new Date(1234740690 * 1000));
    });

    it('should omit expires_after when not requested', async () => {
      const fetchMock = mockFetchResponse({ body: defaultResponseBody });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1]) },
        mediaType: 'application/octet-stream',
      });

      const [, options] = fetchMock.mock.calls[0];
      const body = options.body as FormData;
      expect(body.get('expires_after')).toBeNull();
    });
  });

  describe('uploadFile (stream data)', () => {
    function streamFromChunks(
      chunks: Array<string>,
    ): ReadableStream<Uint8Array> {
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

    it('should stream multipart uploads with fields preceding the file part', async () => {
      const fetchMock = mockFetchResponse({
        body: { ...defaultResponseBody, id: 'file-stream1' },
      });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.uploadFile({
        data: {
          type: 'stream',
          stream: streamFromChunks(['{"a":1}\n', '{"b":2}\n']),
        },
        mediaType: 'application/jsonl',
        filename: 'batch.jsonl',
        providerOptions: { xai: { expiresAfter: 172800, teamId: 'team-1' } },
      });

      expect(result.providerReference).toEqual({ xai: 'file-stream1' });

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.x.ai/v1/files');
      expect(options.method).toBe('POST');
      expect(options.duplex).toBe('half');
      expect(options.headers['content-type']).toMatch(
        /^multipart\/form-data; boundary=ai-sdk-multipart-/,
      );

      const bodyText = await new Response(
        options.body as ReadableStream<Uint8Array>,
      ).text();
      const formData = await new Response(bodyText, {
        headers: { 'content-type': options.headers['content-type'] },
      }).formData();

      expect([...formData.keys()]).toEqual([
        'expires_after',
        'team_id',
        'file',
      ]);
      expect(formData.get('expires_after')).toBe('172800');
      expect(formData.get('team_id')).toBe('team-1');
      const file = formData.get('file') as File;
      expect(file.name).toBe('batch.jsonl');
      expect(await file.text()).toBe('{"a":1}\n{"b":2}\n');
    });
  });

  describe('uploadFile (expiresAfter validation)', () => {
    it('should cancel stream data when expiresAfter is invalid', async () => {
      const cancelSpy = vi.fn();
      const stream = new ReadableStream<Uint8Array>({ cancel: cancelSpy });
      const fetchMock = mockFetchResponse({ body: defaultResponseBody });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      await expect(
        files.uploadFile({
          data: { type: 'stream', stream },
          mediaType: 'application/jsonl',
          providerOptions: { xai: { expiresAfter: 100 } },
        }),
      ).rejects.toThrow();

      expect(cancelSpy).toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([100, 0.5, 3599.5, 2592001])(
      'should reject invalid expiresAfter %j without a fetch call',
      async expiresAfter => {
        const fetchMock = mockFetchResponse({ body: defaultResponseBody });

        const files = new XaiFiles({
          provider: 'xai.files',
          baseURL: 'https://api.x.ai/v1',
          headers: mockHeaders,
          fetch: fetchMock,
        });

        await expect(
          files.uploadFile({
            data: { type: 'data', data: new Uint8Array([1]) },
            mediaType: 'application/octet-stream',
            providerOptions: { xai: { expiresAfter } },
          }),
        ).rejects.toThrow();

        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('getFileMetadata', () => {
    it('should retrieve file metadata via GET', async () => {
      const fetchMock = mockFetchResponse({
        body: {
          ...defaultResponseBody,
          bytes: 1024,
          created_at: 1700000000,
          expires_at: 1700172800,
          filename: 'test.jsonl',
        },
      });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.getFileMetadata({
        file: { xai: 'file-abc123' },
      });

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.x.ai/v1/files/file-abc123');
      expect(options.method).toBe('GET');
      expect(result.providerReference).toEqual({ xai: 'file-abc123' });
      expect(result.byteSize).toBe(1024);
      expect(result.createdAt).toEqual(new Date(1700000000 * 1000));
      expect(result.expiresAt).toEqual(new Date(1700172800 * 1000));
    });

    it.each(['', '   '])(
      'should reject a blank xai file id (%j)',
      async fileId => {
        const files = new XaiFiles({
          provider: 'xai.files',
          baseURL: 'https://api.x.ai/v1',
          headers: mockHeaders,
        });

        await expect(
          files.getFileMetadata({ file: { xai: fileId } }),
        ).rejects.toThrow("file reference is missing an 'xai' file id.");
      },
    );

    it.each([
      ['.', 'https://api.x.ai/v1/files/%252E'],
      ['..', 'https://api.x.ai/v1/files/%252E%252E'],
    ])(
      'should encode a dot-segment file id (%j) so it cannot retarget the path',
      async (fileId, expectedUrl) => {
        const fetchMock = mockFetchResponse({ body: defaultResponseBody });

        const files = new XaiFiles({
          provider: 'xai.files',
          baseURL: 'https://api.x.ai/v1',
          headers: mockHeaders,
          fetch: fetchMock,
        });

        await files.getFileMetadata({ file: { xai: fileId } });

        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe(expectedUrl);
      },
    );

    it('should reject a reference without an xai file id', async () => {
      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
      });

      await expect(
        files.getFileMetadata({ file: { openai: 'file-abc123' } }),
      ).rejects.toThrow("file reference is missing an 'xai' file id.");
    });
  });

  describe('downloadFile', () => {
    it('should download file content as a stream', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('{"result":"ok"}\n', {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
      );

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.downloadFile({ file: { xai: 'file-abc123' } });

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.x.ai/v1/files/file-abc123/content');
      expect(options.method).toBe('GET');
      expect(result.content).toBeInstanceOf(ReadableStream);
      expect(await new Response(result.content).text()).toBe(
        '{"result":"ok"}\n',
      );
    });

    it('should expose the response content type as mediaType (parameters stripped)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('{"result":"ok"}\n', {
          status: 200,
          headers: { 'content-type': 'application/jsonl; charset=utf-8' },
        }),
      );

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.downloadFile({ file: { xai: 'file-abc123' } });

      expect(result.mediaType).toBe('application/jsonl');
    });

    it('should omit mediaType when the response has no content type', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(new TextEncoder().encode('bytes'), { status: 200 }),
        );

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.downloadFile({ file: { xai: 'file-abc123' } });

      expect(result.mediaType).toBeUndefined();
    });
  });

  describe('deleteFile', () => {
    it('should delete a file via DELETE', async () => {
      const fetchMock = mockFetchResponse({
        body: { id: 'file-abc123', object: 'file', deleted: true },
      });

      const files = new XaiFiles({
        provider: 'xai.files',
        baseURL: 'https://api.x.ai/v1',
        headers: mockHeaders,
        fetch: fetchMock,
      });

      const result = await files.deleteFile({ file: { xai: 'file-abc123' } });

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.x.ai/v1/files/file-abc123');
      expect(options.method).toBe('DELETE');
      expect(result.deleted).toBe(true);
      expect(result.providerReference).toEqual({ xai: 'file-abc123' });
    });
  });
});
