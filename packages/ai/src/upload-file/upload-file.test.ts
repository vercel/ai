import { FilesV4, FilesV4UploadFileResult } from '@ai-sdk/provider';
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
  };

  it('should pass Uint8Array data directly to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const data = new Uint8Array([1, 2, 3]);
    const result = await uploadFile({
      files: createMockFiles({ uploadFile: uploadFileSpy }),
      data,
    });

    expect(uploadFileSpy).toHaveBeenCalledWith({
      data,
      providerOptions: {},
    });
    expect(result.providerReference).toEqual({
      'mock-provider': 'file-abc123',
    });
    expect(result.providerMetadata).toEqual({
      'mock-provider': { size: 1024 },
    });
  });

  it('should convert ArrayBuffer data to Uint8Array', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const arrayBuffer = new ArrayBuffer(3);
    const view = new Uint8Array(arrayBuffer);
    view.set([4, 5, 6]);

    await uploadFile({
      files: createMockFiles({ uploadFile: uploadFileSpy }),
      data: arrayBuffer,
    });

    const callArg = uploadFileSpy.mock.calls[0][0];
    expect(callArg.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(callArg.data as Uint8Array)).toEqual([4, 5, 6]);
  });

  it('should pass URL data through to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const url = new URL('https://example.com/file.pdf');
    await uploadFile({
      files: createMockFiles({ uploadFile: uploadFileSpy }),
      data: url,
    });

    const callArg = uploadFileSpy.mock.calls[0][0];
    expect(callArg.data).toEqual(url);
  });

  it('should convert string URL to URL object', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    await uploadFile({
      files: createMockFiles({ uploadFile: uploadFileSpy }),
      data: 'https://example.com/file.pdf',
    });

    const callArg = uploadFileSpy.mock.calls[0][0];
    expect(callArg.data).toBeInstanceOf(URL);
    expect((callArg.data as URL).href).toBe('https://example.com/file.pdf');
  });

  it('should pass base64 string data through to files.uploadFile', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    const base64 = 'dGVzdA==';
    await uploadFile({
      files: createMockFiles({ uploadFile: uploadFileSpy }),
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
      files: createMockFiles({ uploadFile: uploadFileSpy }),
      data: new Uint8Array([1]),
      providerOptions,
    });

    expect(uploadFileSpy).toHaveBeenCalledWith({
      data: new Uint8Array([1]),
      providerOptions,
    });
  });

  it('should default providerOptions to empty object', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue(mockResult);

    await uploadFile({
      files: createMockFiles({ uploadFile: uploadFileSpy }),
      data: new Uint8Array([1]),
    });

    expect(uploadFileSpy).toHaveBeenCalledWith({
      data: new Uint8Array([1]),
      providerOptions: {},
    });
  });

  it('should return result without providerMetadata when not provided', async () => {
    const uploadFileSpy = vi.fn().mockResolvedValue({
      providerReference: { 'mock-provider': 'file-xyz' },
    });

    const result = await uploadFile({
      files: createMockFiles({ uploadFile: uploadFileSpy }),
      data: new Uint8Array([1]),
    });

    expect(result.providerReference).toEqual({
      'mock-provider': 'file-xyz',
    });
    expect(result.providerMetadata).toBeUndefined();
  });
});
