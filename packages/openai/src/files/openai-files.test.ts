import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { createOpenAI } from '../openai-provider';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const server = createTestServer({
  'https://api.openai.com/v1/files': {},
  'https://api.openai.com/v1/files/file-abc123': {},
  'https://api.openai.com/v1/files/file-abc123/content': {},
});

function prepareFileResponse({
  headers,
  id = 'file-abc123',
}: {
  headers?: Record<string, string>;
  id?: string;
} = {}) {
  server.urls['https://api.openai.com/v1/files'].response = {
    type: 'json-value',
    headers,
    body: {
      id,
      object: 'file',
      bytes: 1024,
      created_at: 1700000000,
      filename: 'test.csv',
      purpose: 'assistants',
      status: 'processed',
      expires_at: null,
    },
  };
}

describe('OpenAI Files - uploadFile', () => {
  it('should send correct multipart request with purpose', async () => {
    prepareFileResponse();

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/octet-stream',
      providerOptions: {
        openai: { purpose: 'assistants' },
      },
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart).toMatchObject({
      purpose: 'assistants',
    });
    expect(multipart!.file).toBeDefined();
  });

  it('should return providerReference with openai key', async () => {
    prepareFileResponse({ id: 'file-xyz789' });

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    const result = await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/octet-stream',
      providerOptions: {
        openai: { purpose: 'assistants' },
      },
    });

    expect(result.providerReference).toEqual({ openai: 'file-xyz789' });
  });

  it('should return providerMetadata from response', async () => {
    prepareFileResponse();

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    const result = await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/octet-stream',
      providerOptions: {
        openai: { purpose: 'assistants' },
      },
    });

    expect(result.providerMetadata).toEqual({
      openai: {
        filename: 'test.csv',
        purpose: 'assistants',
        bytes: 1024,
        createdAt: 1700000000,
        status: 'processed',
      },
    });
  });

  it('should default purpose to assistants when not provided', async () => {
    prepareFileResponse();

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/octet-stream',
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart).toMatchObject({
      purpose: 'assistants',
    });
  });

  it('should pass expires_after as bracketed multipart fields', async () => {
    prepareFileResponse();

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/octet-stream',
      providerOptions: {
        openai: { purpose: 'assistants', expiresAfter: 3600 },
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

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/octet-stream',
      providerOptions: {
        openai: { purpose: 'assistants' },
      },
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart).not.toHaveProperty('expires_after[anchor]');
    expect(multipart).not.toHaveProperty('expires_after[seconds]');
  });

  it('should pass auth headers', async () => {
    prepareFileResponse();

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-org',
      project: 'test-project',
      headers: {
        'Custom-Header': 'custom-value',
      },
    });
    const files = provider.files();

    await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/octet-stream',
      providerOptions: {
        openai: { purpose: 'assistants' },
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'openai-organization': 'test-org',
      'openai-project': 'test-project',
      'custom-header': 'custom-value',
    });
  });

  it('should handle base64 string data', async () => {
    prepareFileResponse();

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    const result = await files.uploadFile({
      data: { type: 'data', data: btoa('hello world') },
      mediaType: 'application/octet-stream',
      providerOptions: {
        openai: { purpose: 'assistants' },
      },
    });

    expect(result.providerReference).toEqual({ openai: 'file-abc123' });
  });

  it('should set specificationVersion and provider', () => {
    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    expect(files.specificationVersion).toBe('v4');
    expect(files.provider).toBe('openai.files');
  });
});

describe('OpenAI Files - uploadFile (stream data)', () => {
  function streamFromChunks(chunks: Array<string>): ReadableStream<Uint8Array> {
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

  it('should stream a multipart upload with fields preceding the file part', async () => {
    prepareFileResponse({ id: 'file-stream1' });

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    const result = await files.uploadFile({
      data: {
        type: 'stream',
        stream: streamFromChunks(['{"a":1}\n', '{"b":2}\n']),
      },
      mediaType: 'application/jsonl',
      filename: 'batch.jsonl',
      providerOptions: {
        openai: { purpose: 'batch', expiresAfter: 172800 },
      },
    });

    expect(result.providerReference).toEqual({ openai: 'file-stream1' });

    expect(server.calls[0].requestHeaders['content-type']).toMatch(
      /^multipart\/form-data; boundary=ai-sdk-multipart-/,
    );

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart).toMatchObject({
      purpose: 'batch',
      'expires_after[anchor]': 'created_at',
      'expires_after[seconds]': '172800',
    });
    const file = multipart!.file as File;
    expect(file.name).toBe('batch.jsonl');
    expect(await file.text()).toBe('{"a":1}\n{"b":2}\n');
  });

  it('should default the filename to "blob" on filename-less stream uploads', async () => {
    prepareFileResponse();

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    await files.uploadFile({
      data: { type: 'stream', stream: streamFromChunks(['x']) },
      mediaType: 'application/jsonl',
      providerOptions: { openai: { purpose: 'batch' } },
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    const file = multipart!.file as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('blob');
  });

  it('should omit expiry fields on stream uploads without expiresAfter', async () => {
    prepareFileResponse();

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    await files.uploadFile({
      data: { type: 'stream', stream: streamFromChunks(['x']) },
      mediaType: 'application/jsonl',
      filename: 'batch.jsonl',
      providerOptions: { openai: { purpose: 'batch' } },
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart).not.toHaveProperty('expires_after[anchor]');
    expect(multipart).not.toHaveProperty('expires_after[seconds]');
  });
});

describe('OpenAI Files - uploadFile (result fields)', () => {
  it('should expose byteSize/createdAt/expiresAt from the upload response', async () => {
    server.urls['https://api.openai.com/v1/files'].response = {
      type: 'json-value',
      body: {
        id: 'file-exp1',
        object: 'file',
        bytes: 2048,
        created_at: 1700000000,
        filename: 'batch.jsonl',
        purpose: 'batch',
        status: 'processed',
        expires_at: 1700172800,
      },
    };

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    const result = await files.uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/jsonl',
      providerOptions: {
        openai: { purpose: 'batch', expiresAfter: 172800 },
      },
    });

    expect(result.byteSize).toBe(2048);
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000));
    expect(result.expiresAt).toEqual(new Date(1700172800 * 1000));
  });
});

describe('OpenAI Files - uploadFile (pre-request rejection)', () => {
  it('should cancel stream data when provider options are invalid', async () => {
    const cancelSpy = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelSpy });

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    await expect(
      files.uploadFile({
        data: { type: 'stream', stream },
        mediaType: 'application/jsonl',
        providerOptions: {
          openai: { expiresAfter: 'not-a-number' as never },
        },
      }),
    ).rejects.toThrow();

    expect(cancelSpy).toHaveBeenCalled();
    expect(server.calls.length).toBe(0);
  });
});

describe('OpenAI Files - getFileMetadata', () => {
  function prepareRetrieveResponse({
    expires_at = null,
  }: { expires_at?: number | null } = {}) {
    server.urls['https://api.openai.com/v1/files/file-abc123'].response = {
      type: 'json-value',
      body: {
        id: 'file-abc123',
        object: 'file',
        bytes: 1024,
        created_at: 1700000000,
        filename: 'test.jsonl',
        purpose: 'batch',
        status: 'processed',
        expires_at,
      },
    };
  }

  it('should retrieve file metadata via GET', async () => {
    prepareRetrieveResponse({ expires_at: 1700172800 });

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    const result = await files.getFileMetadata!({
      file: { openai: 'file-abc123' },
    });

    expect(server.calls[0].requestMethod).toBe('GET');
    expect(result.providerReference).toEqual({ openai: 'file-abc123' });
    expect(result.filename).toBe('test.jsonl');
    expect(result.byteSize).toBe(1024);
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000));
    expect(result.expiresAt).toEqual(new Date(1700172800 * 1000));
    expect(result.providerMetadata).toEqual({
      openai: {
        filename: 'test.jsonl',
        purpose: 'batch',
        bytes: 1024,
        createdAt: 1700000000,
        status: 'processed',
        expiresAt: 1700172800,
      },
    });
  });

  it('should omit expiresAt when the provider reports none', async () => {
    prepareRetrieveResponse();

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    const result = await files.getFileMetadata!({
      file: { openai: 'file-abc123' },
    });

    expect(result.expiresAt).toBeUndefined();
  });

  it.each(['', '   '])(
    'should reject a blank openai file id (%j)',
    async fileId => {
      const provider = createOpenAI({ apiKey: 'test-api-key' });
      const files = provider.files();

      await expect(
        files.getFileMetadata!({ file: { openai: fileId } }),
      ).rejects.toThrow("file reference is missing an 'openai' file id.");
    },
  );

  it.each(['.', '..'])(
    'should not let a dot-segment file id (%j) retarget the path',
    async fileId => {
      const provider = createOpenAI({ apiKey: 'test-api-key' });
      const files = provider.files();

      // encodes to a non-normalizable segment, so the request targets an
      // unregistered URL instead of /v1/files or a parent path
      await expect(
        files.getFileMetadata!({ file: { openai: fileId } }),
      ).rejects.toThrow();
      expect(server.calls.length).toBe(0);
    },
  );

  it('should reject a reference without an openai file id', async () => {
    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    await expect(
      files.getFileMetadata!({ file: { other: 'file-abc123' } }),
    ).rejects.toThrow("file reference is missing an 'openai' file id.");
  });
});

describe('OpenAI Files - downloadFile', () => {
  it('should download file content as a stream', async () => {
    server.urls[
      'https://api.openai.com/v1/files/file-abc123/content'
    ].response = {
      type: 'binary',
      body: Buffer.from('{"result":"ok"}\n'),
    };

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    const result = await files.downloadFile!({
      file: { openai: 'file-abc123' },
    });

    expect(server.calls[0].requestMethod).toBe('GET');
    expect(result.content).toBeInstanceOf(ReadableStream);
    expect(await new Response(result.content).text()).toBe('{"result":"ok"}\n');
  });

  it('should expose the response content type as mediaType (parameters stripped)', async () => {
    server.urls[
      'https://api.openai.com/v1/files/file-abc123/content'
    ].response = {
      type: 'binary',
      headers: { 'content-type': 'application/jsonl; charset=utf-8' },
      body: Buffer.from('{"result":"ok"}\n'),
    };

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    const result = await files.downloadFile!({
      file: { openai: 'file-abc123' },
    });

    expect(result.mediaType).toBe('application/jsonl');
  });
});

describe('OpenAI Files - deleteFile', () => {
  it('should delete a file via DELETE', async () => {
    server.urls['https://api.openai.com/v1/files/file-abc123'].response = {
      type: 'json-value',
      body: { id: 'file-abc123', object: 'file', deleted: true },
    };

    const provider = createOpenAI({ apiKey: 'test-api-key' });
    const files = provider.files();

    const result = await files.deleteFile!({ file: { openai: 'file-abc123' } });

    expect(server.calls[0].requestMethod).toBe('DELETE');
    expect(result.deleted).toBe(true);
    expect(result.providerReference).toEqual({ openai: 'file-abc123' });
  });
});
