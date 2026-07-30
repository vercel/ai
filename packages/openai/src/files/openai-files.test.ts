import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { createOpenAI } from '../openai-provider';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const server = createTestServer({
  'https://api.openai.com/v1/files': {},
});

const issue18223LiveResponses = JSON.parse(
  readFileSync(
    new URL(
      './__fixtures__/issue-18223-live-file-upload-responses.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  directBracketedUpload: {
    requestFields: Record<string, string>;
    response: {
      id: string;
      expires_at: number;
    };
  };
  flatExpiresAfterUpload: {
    requestFields: Record<string, string>;
    response: {
      error: {
        message: string;
        type: string;
        param: null;
        code: null;
      };
    };
  };
};

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

  it('should pass expires_after when provided', async () => {
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
    expect(multipart!.expires_after).toBe('3600');
  });

  it('should upload a file with retention using the OpenAI multipart shape', async () => {
    const provider = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async (_url, init) => {
        const formData = init?.body;

        if (!(formData instanceof FormData)) {
          throw new Error('Expected a multipart FormData body.');
        }

        const requestFields = Object.fromEntries(
          [...formData.entries()]
            .filter((entry): entry is [string, string] => {
              return typeof entry[1] === 'string';
            })
            .map(([key, value]) => [key, value]),
        );

        if (
          requestFields.expires_after ===
          issue18223LiveResponses.flatExpiresAfterUpload.requestFields
            .expires_after
        ) {
          return new Response(
            JSON.stringify(
              issue18223LiveResponses.flatExpiresAfterUpload.response,
            ),
            {
              status: 400,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        expect(requestFields).toMatchObject(
          issue18223LiveResponses.directBracketedUpload.requestFields,
        );

        return new Response(
          JSON.stringify(
            issue18223LiveResponses.directBracketedUpload.response,
          ),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      },
    });

    const result = await provider.files().uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/octet-stream',
      providerOptions: {
        openai: { purpose: 'user_data', expiresAfter: 604800 },
      },
    });

    expect(result.providerMetadata?.openai?.expiresAt).toBe(
      issue18223LiveResponses.directBracketedUpload.response.expires_at,
    );
    expect(result.warnings).toEqual([]);
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
