import type {
  FilesV4,
  FilesV4UploadFileResult,
  ProviderV4,
} from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { uploadFile } from './upload-file';

describe('uploadFile', () => {
  function createMockFiles(options: {
    uploadFile: FilesV4['uploadFile'];
  }): FilesV4 {
    return {
      specificationVersion: 'v4',
      provider: 'mock-provider',
      uploadFile: options.uploadFile,
    };
  }

  const mockResult: FilesV4UploadFileResult = {
    providerReference: { 'mock-provider': 'file-abc123' },
    providerMetadata: { 'mock-provider': { size: 1024 } },
    warnings: [],
  };

  it('should pass tagged data through to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const data = { type: 'data' as const, data: new Uint8Array([1, 2, 3]) };
    const result = await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data,
    });

    expect(uploadFileSpy).toHaveBeenCalledWith({
      data,
      mediaType: 'application/octet-stream',
      filename: undefined,
      providerOptions: undefined,
    });
    expect(result.providerReference).toEqual({
      'mock-provider': 'file-abc123',
    });
    expect(result.providerMetadata).toEqual({
      'mock-provider': { size: 1024 },
    });
    expect(result.warnings).toEqual([]);
  });

  it('should pass tagged base64 string data through to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const base64 = 'dGVzdA==';
    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: { type: 'data', data: base64 },
    });

    const callArg = uploadFileSpy.mock.calls[0][0];
    expect(callArg.data).toEqual({ type: 'data', data: base64 });
  });

  it('should default mediaType to text/plain for tagged text data', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: { type: 'text', text: 'hello world' },
    });

    expect(uploadFileSpy).toHaveBeenCalledWith({
      data: { type: 'text', text: 'hello world' },
      mediaType: 'text/plain',
      filename: undefined,
      providerOptions: undefined,
    });
  });

  it('should default mediaType to application/octet-stream for stream data', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const data = {
      type: 'stream' as const,
      stream: new ReadableStream<Uint8Array>(),
    };
    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data,
    });

    expect(uploadFileSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data,
        mediaType: 'application/octet-stream',
      }),
    );
  });

  it('should cancel stream data when the api has no files() method', async () => {
    const cancelSpy = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelSpy });

    await expect(
      uploadFile({
        api: { specificationVersion: 'v4', provider: 'no-files' } as never,
        data: { type: 'stream', stream },
      }),
    ).rejects.toThrow('does not support file uploads');

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('should cancel stream data when the provider upload rejects', async () => {
    const cancelSpy = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelSpy });
    const uploadFileSpy = vi
      .fn()
      .mockRejectedValue(new Error('validation failed'));

    await expect(
      uploadFile({
        api: createMockFiles({ uploadFile: uploadFileSpy }),
        data: { type: 'stream', stream },
      }),
    ).rejects.toThrow('validation failed');

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('should forward abortSignal and headers to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);
    const controller = new AbortController();

    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      abortSignal: controller.signal,
      headers: { 'x-request-id': 'req-1' },
    });

    expect(uploadFileSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: controller.signal,
        headers: { 'x-request-id': 'req-1' },
      }),
    );
  });

  it('should pass byteSize/createdAt/expiresAt through from the provider result', async () => {
    const createdAt = new Date(1700000000 * 1000);
    const expiresAt = new Date(1700172800 * 1000);
    const uploadFileSpy = vi.fn().mockResolvedValue({
      ...mockResult,
      byteSize: 2048,
      createdAt,
      expiresAt,
    });

    const result = await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
    });

    expect(result.byteSize).toBe(2048);
    expect(result.createdAt).toEqual(createdAt);
    expect(result.expiresAt).toEqual(expiresAt);
  });

  it('should forward providerOptions to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const providerOptions = {
      'mock-provider': { purpose: 'assistants' },
    };

    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: { type: 'data', data: new Uint8Array([1]) },
      providerOptions,
    });

    expect(uploadFileSpy).toHaveBeenCalledWith({
      data: { type: 'data', data: new Uint8Array([1]) },
      mediaType: 'application/octet-stream',
      filename: undefined,
      providerOptions,
    });
  });

  it('should pass undefined providerOptions when not provided', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: { type: 'data', data: new Uint8Array([1]) },
    });

    expect(uploadFileSpy).toHaveBeenCalledWith({
      data: { type: 'data', data: new Uint8Array([1]) },
      mediaType: 'application/octet-stream',
      filename: undefined,
      providerOptions: undefined,
    });
  });

  it('should pass filename through to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: { type: 'data', data: new Uint8Array([1]) },
      filename: 'test.pdf',
    });

    const callArg = uploadFileSpy.mock.calls[0][0];
    expect(callArg.filename).toBe('test.pdf');
  });

  it('should pass warnings from provider result', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue({
      providerReference: { 'mock-provider': 'file-abc' },
      warnings: [{ type: 'unsupported', feature: 'filename' }],
    });

    const result = await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: { type: 'data', data: new Uint8Array([1]) },
      filename: 'test.pdf',
    });

    expect(result.warnings).toEqual([
      { type: 'unsupported', feature: 'filename' },
    ]);
  });

  it('should resolve FilesV4 from ProviderV4 with files() method', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);
    const mockFiles = createMockFiles({ uploadFile: uploadFileSpy });
    const mockProvider = {
      specificationVersion: 'v4' as const,
      languageModel: vi.fn(),
      embeddingModel: vi.fn(),
      imageModel: vi.fn(),
      files: vi.fn().mockReturnValue(mockFiles),
    } satisfies ProviderV4;

    await uploadFile({
      api: mockProvider,
      data: { type: 'data', data: new Uint8Array([1]) },
    });

    expect(mockProvider.files).toHaveBeenCalled();
    expect(uploadFileSpy).toHaveBeenCalled();
  });

  it('should throw when ProviderV4 has no files() method', async () => {
    const mockProvider = {
      specificationVersion: 'v4' as const,
      languageModel: vi.fn(),
      embeddingModel: vi.fn(),
      imageModel: vi.fn(),
    } satisfies ProviderV4;

    await expect(
      uploadFile({
        api: mockProvider,
        data: { type: 'data', data: new Uint8Array([1]) },
      }),
    ).rejects.toThrow(
      'The provider does not support file uploads. Make sure it exposes a files() method.',
    );
  });

  it('should return result without providerMetadata when not provided', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue({
      providerReference: { 'mock-provider': 'file-xyz' },
      warnings: [],
    });

    const result = await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: { type: 'data', data: new Uint8Array([1]) },
    });

    expect(result.providerReference).toEqual({
      'mock-provider': 'file-xyz',
    });
    expect(result.providerMetadata).toBeUndefined();
  });
});
