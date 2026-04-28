import { FilesV4, FilesV4UploadFileResult, ProviderV4 } from '@ai-sdk/provider';
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

  it('should pass Uint8Array data directly to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const data = new Uint8Array([1, 2, 3]);
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

  it('should convert ArrayBuffer data to Uint8Array', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const arrayBuffer = new ArrayBuffer(3);
    const view = new Uint8Array(arrayBuffer);
    view.set([4, 5, 6]);

    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: arrayBuffer,
    });

    const callArg = uploadFileSpy.mock.calls[0][0];
    expect(callArg.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(callArg.data as Uint8Array)).toEqual([4, 5, 6]);
  });

  it('should reject URL data with a clear error message', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    await expect(
      uploadFile({
        api: createMockFiles({ uploadFile: uploadFileSpy }),
        data: new Uint8Array([0]),
      }),
    ).resolves.toBeDefined();

    await expect(
      uploadFile({
        api: createMockFiles({ uploadFile: uploadFileSpy }),
        // string URLs get converted to URL objects by convertToLanguageModelV4DataContent
        data: 'https://example.com/file.pdf' as any,
      }),
    ).rejects.toThrow(
      'URL data is not supported for file uploads. Fetch the URL content first and pass the bytes.',
    );
  });

  it('should pass base64 string data through to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const base64 = 'dGVzdA==';
    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: base64,
    });

    const callArg = uploadFileSpy.mock.calls[0][0];
    expect(callArg.data).toBe(base64);
  });

  it('should forward providerOptions to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const providerOptions = {
      'mock-provider': { purpose: 'assistants' },
    };

    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: new Uint8Array([1]),
      providerOptions,
    });

    expect(uploadFileSpy).toHaveBeenCalledWith({
      data: new Uint8Array([1]),
      mediaType: 'application/octet-stream',
      filename: undefined,
      providerOptions,
    });
  });

  it('should pass undefined providerOptions when not provided', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: new Uint8Array([1]),
    });

    expect(uploadFileSpy).toHaveBeenCalledWith({
      data: new Uint8Array([1]),
      mediaType: 'application/octet-stream',
      filename: undefined,
      providerOptions: undefined,
    });
  });

  it('should pass filename through to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    await uploadFile({
      api: createMockFiles({ uploadFile: uploadFileSpy }),
      data: new Uint8Array([1]),
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
      data: new Uint8Array([1]),
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

    await uploadFile({ api: mockProvider, data: new Uint8Array([1]) });

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
      uploadFile({ api: mockProvider, data: new Uint8Array([1]) }),
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
      data: new Uint8Array([1]),
    });

    expect(result.providerReference).toEqual({
      'mock-provider': 'file-xyz',
    });
    expect(result.providerMetadata).toBeUndefined();
  });
});
