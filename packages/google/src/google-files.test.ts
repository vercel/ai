import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  GoogleFilesClient,
  createGoogleFilesClient,
  GoogleFile,
} from './google-files';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('GoogleFilesClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: GoogleFilesClient;

  const createMockResponse = (data: any, ok = true, status = 200) => ({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers(),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });

  const createMockFile = (overrides: Partial<GoogleFile> = {}): GoogleFile => ({
    name: 'files/abc123',
    displayName: 'test-file.mp4',
    mimeType: 'video/mp4',
    sizeBytes: '1048576',
    createTime: '2025-01-01T00:00:00Z',
    updateTime: '2025-01-01T00:00:00Z',
    expirationTime: '2025-01-03T00:00:00Z',
    sha256Hash: 'abc123hash',
    uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
    state: 'ACTIVE',
    ...overrides,
  });

  beforeEach(() => {
    mockFetch = vi.fn();
    client = createGoogleFilesClient({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: { 'x-goog-api-key': 'test-api-key' },
      fetch: mockFetch as any,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('upload', () => {
    it('should upload a file using resumable upload protocol', async () => {
      const mockFile = createMockFile();
      const uploadUrl = 'https://upload.example.com/session123';

      // Mock init response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'X-Goog-Upload-URL': uploadUrl }),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve('{}'),
        })
        // Mock upload response
        .mockResolvedValueOnce(createMockResponse({ file: mockFile }));

      const fileData = new Uint8Array([1, 2, 3, 4]);
      const result = await client.upload({
        file: fileData,
        mimeType: 'video/mp4',
        displayName: 'test-video.mp4',
      });

      // Verify init request
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://generativelanguage.googleapis.com/upload/v1beta/files',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ file: { displayName: 'test-video.mp4' } }),
        }),
      );

      // Verify upload request
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        uploadUrl,
        expect.objectContaining({
          method: 'POST',
        }),
      );

      expect(result).toEqual(mockFile);
    });

    it('should throw error if init fails', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            error: {
              code: 400,
              message: 'Invalid request',
              status: 'INVALID_ARGUMENT',
            },
          },
          false,
          400,
        ),
      );

      const fileData = new Uint8Array([1, 2, 3, 4]);

      await expect(
        client.upload({
          file: fileData,
          mimeType: 'video/mp4',
        }),
      ).rejects.toThrow('Invalid request');
    });

    it('should throw error if upload URL not in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(), // No upload URL
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('{}'),
      });

      const fileData = new Uint8Array([1, 2, 3, 4]);

      await expect(
        client.upload({
          file: fileData,
          mimeType: 'video/mp4',
        }),
      ).rejects.toThrow('Failed to get upload URL from response headers');
    });

    it('should handle Blob input', async () => {
      const mockFile = createMockFile();
      const uploadUrl = 'https://upload.example.com/session123';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'X-Goog-Upload-URL': uploadUrl }),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve('{}'),
        })
        .mockResolvedValueOnce(createMockResponse({ file: mockFile }));

      const blob = new Blob(['test data'], { type: 'video/mp4' });
      const result = await client.upload({
        file: blob,
        mimeType: 'video/mp4',
      });

      expect(result).toEqual(mockFile);
    });
  });

  describe('get', () => {
    it('should get file metadata by name', async () => {
      const mockFile = createMockFile();
      mockFetch.mockResolvedValueOnce(createMockResponse(mockFile));

      const result = await client.get('files/abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/files/abc123',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(result).toEqual(mockFile);
    });

    it('should return file in PROCESSING state', async () => {
      const mockFile = createMockFile({ state: 'PROCESSING' });
      mockFetch.mockResolvedValueOnce(createMockResponse(mockFile));

      const result = await client.get('files/abc123');

      expect(result.state).toBe('PROCESSING');
    });

    it('should return file with error details when FAILED', async () => {
      const mockFile = createMockFile({
        state: 'FAILED',
        error: {
          code: 500,
          message: 'Processing failed',
          status: 'INTERNAL',
        },
      });
      mockFetch.mockResolvedValueOnce(createMockResponse(mockFile));

      const result = await client.get('files/abc123');

      expect(result.state).toBe('FAILED');
      expect(result.error?.message).toBe('Processing failed');
    });

    it('should throw error when file is not found', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            error: {
              code: 404,
              message: 'File not found',
              status: 'NOT_FOUND',
            },
          },
          false,
          404,
        ),
      );

      await expect(client.get('files/nonexistent')).rejects.toThrow();
    });
  });

  describe('list', () => {
    it('should list files with default options', async () => {
      const mockFiles = [
        createMockFile({ name: 'files/file1' }),
        createMockFile({ name: 'files/file2' }),
      ];
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ files: mockFiles, nextPageToken: 'token123' }),
      );

      const result = await client.list();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/files',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(result.files).toHaveLength(2);
      expect(result.nextPageToken).toBe('token123');
    });

    it('should list files with pagination options', async () => {
      const mockFiles = [createMockFile({ name: 'files/file3' })];
      mockFetch.mockResolvedValueOnce(createMockResponse({ files: mockFiles }));

      await client.list({ pageSize: 10, pageToken: 'prevToken' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/files?pageSize=10&pageToken=prevToken',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should return empty array when no files exist', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      const result = await client.list();

      expect(result.files).toEqual([]);
      expect(result.nextPageToken).toBeUndefined();
    });

    it('should throw error when list request fails', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            error: { code: 500, message: 'Internal error', status: 'INTERNAL' },
          },
          false,
          500,
        ),
      );

      await expect(client.list()).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete a file by name', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await client.delete('files/abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/files/abc123',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('should throw error when delete fails', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            error: {
              code: 404,
              message: 'File not found',
              status: 'NOT_FOUND',
            },
          },
          false,
          404,
        ),
      );

      await expect(client.delete('files/nonexistent')).rejects.toThrow();
    });
  });

  describe('waitForProcessing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return immediately if file is already ACTIVE', async () => {
      const mockFile = createMockFile({ state: 'ACTIVE' });
      mockFetch.mockResolvedValueOnce(createMockResponse(mockFile));

      const resultPromise = client.waitForProcessing('files/abc123');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.state).toBe('ACTIVE');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should poll until file becomes ACTIVE', async () => {
      const processingFile = createMockFile({ state: 'PROCESSING' });
      const activeFile = createMockFile({ state: 'ACTIVE' });

      mockFetch
        .mockResolvedValueOnce(createMockResponse(processingFile))
        .mockResolvedValueOnce(createMockResponse(processingFile))
        .mockResolvedValueOnce(createMockResponse(activeFile));

      const resultPromise = client.waitForProcessing('files/abc123', {
        pollInterval: 1000,
      });

      // Process first poll (PROCESSING)
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Wait for poll interval and process second poll (PROCESSING)
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Wait for poll interval and process third poll (ACTIVE)
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      const result = await resultPromise;
      expect(result.state).toBe('ACTIVE');
    });

    it('should throw error if file processing fails', async () => {
      const failedFile = createMockFile({
        state: 'FAILED',
        error: {
          code: 500,
          message: 'Video codec not supported',
          status: 'INTERNAL',
        },
      });
      mockFetch.mockResolvedValueOnce(createMockResponse(failedFile));

      // Capture the error using Promise.allSettled to avoid unhandled rejection
      let capturedError: Error | undefined;
      const resultPromise = client
        .waitForProcessing('files/abc123')
        .catch(e => {
          capturedError = e;
          return null; // Prevent unhandled rejection
        });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(capturedError).toBeDefined();
      expect(capturedError?.message).toBe(
        'File processing failed: Video codec not supported',
      );
    });

    it('should throw error with default message if file fails without error details', async () => {
      const failedFile = createMockFile({
        state: 'FAILED',
        // No error field - tests the fallback to 'Unknown error'
      });
      mockFetch.mockResolvedValueOnce(createMockResponse(failedFile));

      let capturedError: Error | undefined;
      const resultPromise = client
        .waitForProcessing('files/abc123')
        .catch(e => {
          capturedError = e;
          return null;
        });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(capturedError).toBeDefined();
      expect(capturedError?.message).toBe(
        'File processing failed: Unknown error',
      );
    });

    it('should throw error if timeout is reached', async () => {
      const processingFile = createMockFile({ state: 'PROCESSING' });
      mockFetch.mockResolvedValue(createMockResponse(processingFile));

      // Capture the error using Promise.allSettled to avoid unhandled rejection
      let capturedError: Error | undefined;
      const resultPromise = client
        .waitForProcessing('files/abc123', {
          pollInterval: 1000,
          maxWaitTime: 3000,
        })
        .catch(e => {
          capturedError = e;
          return null; // Prevent unhandled rejection
        });

      // Advance time past the timeout
      await vi.advanceTimersByTimeAsync(4000);
      await resultPromise;

      expect(capturedError).toBeDefined();
      expect(capturedError?.message).toContain(
        'Timed out waiting for file processing after 3000ms',
      );
    });

    it('should use custom poll interval', async () => {
      const processingFile = createMockFile({ state: 'PROCESSING' });
      const activeFile = createMockFile({ state: 'ACTIVE' });

      mockFetch
        .mockResolvedValueOnce(createMockResponse(processingFile))
        .mockResolvedValueOnce(createMockResponse(activeFile));

      const resultPromise = client.waitForProcessing('files/abc123', {
        pollInterval: 5000,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should not poll yet at 3 seconds
      await vi.advanceTimersByTimeAsync(3000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should poll after 5 seconds
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const result = await resultPromise;
      expect(result.state).toBe('ACTIVE');
    });
  });
});

describe('createGoogleFilesClient', () => {
  it('should create a GoogleFilesClient instance', () => {
    const client = createGoogleFilesClient({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: { 'x-goog-api-key': 'test-key' },
    });

    expect(client).toBeInstanceOf(GoogleFilesClient);
  });

  it('should work with async headers', async () => {
    const mockFileData = {
      name: 'files/abc123',
      displayName: 'test.mp4',
      mimeType: 'video/mp4',
      sizeBytes: '1024',
      createTime: '2025-01-01T00:00:00Z',
      updateTime: '2025-01-01T00:00:00Z',
      expirationTime: '2025-01-03T00:00:00Z',
      sha256Hash: 'hash123',
      uri: 'https://example.com/files/abc123',
      state: 'ACTIVE',
    };
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve(mockFileData),
      text: () => Promise.resolve(JSON.stringify(mockFileData)),
    });

    const client = createGoogleFilesClient({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: async () => ({ 'x-goog-api-key': 'async-key' }),
      fetch: mockFetch as any,
    });

    await client.get('files/abc123');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-goog-api-key': 'async-key',
        }),
      }),
    );
  });
});
