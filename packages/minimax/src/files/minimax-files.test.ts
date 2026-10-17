import { InvalidArgumentError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { MiniMaxFiles } from './minimax-files';
import type { FetchFunction } from '@ai-sdk/provider-utils';

vi.mock('../../version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_BASE_URL = 'https://api.example.com';
const FILES_URL = `${TEST_BASE_URL}/v1/files/upload`;
const DELETE_URL = `${TEST_BASE_URL}/v1/files/delete`;

const mockFileResponse = {
  file: {
    file_id: 12345,
    bytes: 1024,
    created_at: 1700000000,
    filename: 'test-audio.mp3',
    purpose: 'voice_clone',
  },
  base_resp: {
    status_code: 0,
    status_msg: 'success',
  },
};

const mockDeleteResponse = {
  file_id: 12345,
  base_resp: {
    status_code: 0,
    status_msg: 'success',
  },
};

function createFiles({
  baseURL = TEST_BASE_URL,
  fetch,
}: {
  baseURL?: string;
  fetch?: FetchFunction;
} = {}) {
  return new MiniMaxFiles({
    provider: 'minimax.files',
    baseURL,
    headers: () => ({ Authorization: 'Bearer test-key' }),
    fetch,
  });
}

describe('MiniMaxFiles', () => {
  const server = createTestServer({
    [FILES_URL]: {
      response: { type: 'json-value', body: mockFileResponse },
    },
    [DELETE_URL]: {
      response: { type: 'json-value', body: mockDeleteResponse },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and specification version', () => {
      const files = createFiles();

      expect(files.provider).toBe('minimax.files');
      expect(files.specificationVersion).toBe('v4');
    });
  });

  describe('uploadFile', () => {
    it('should send correct multipart request with file data', async () => {
      const files = createFiles();

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'application/octet-stream',
        filename: 'test.mp3',
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(multipart).toBeDefined();
      expect(multipart!.file).toBeDefined();
    });

    it('should send purpose in multipart request', async () => {
      const files = createFiles();

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'audio/mpeg',
        filename: 'test.mp3',
        providerOptions: {
          minimax: {
            purpose: 'voice_clone',
          },
        },
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(multipart).toMatchObject({
        purpose: 'voice_clone',
      });
    });

    it('should default purpose to t2a_async_input when not provided', async () => {
      const files = createFiles();

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'audio/mpeg',
        filename: 'test.mp3',
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(multipart).toMatchObject({
        purpose: 't2a_async_input',
      });
    });

    it('should return providerReference with minimax key and file_id', async () => {
      const files = createFiles();

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'audio/mpeg',
        filename: 'test.mp3',
      });

      expect(result.providerReference).toEqual({ minimax: '12345' });
    });

    it('should return providerMetadata from response', async () => {
      const files = createFiles();

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'audio/mpeg',
        filename: 'test.mp3',
      });

      expect(result.filename).toBe('test-audio.mp3');
      expect(result.createdAt).toEqual(new Date(1700000000 * 1000));
      expect(result.byteSize).toBe(1024);
      expect(result.providerMetadata).toEqual({
        minimax: {
          filename: 'test-audio.mp3',
          createdAt: 1700000000,
          bytes: 1024,
          purpose: 'voice_clone',
        },
      });
    });

    it('should fallback byteSize to actual data length when response bytes is null', async () => {
      server.urls[FILES_URL].response = {
        type: 'json-value',
        body: {
          file: {
            file_id: 12345,
            bytes: 5,
            created_at: 1700000000,
            filename: 'test-audio.mp3',
            purpose: 'voice_clone',
          },
          base_resp: {
            status_code: 0,
            status_msg: 'success',
          },
        },
      };

      const files = createFiles();

      const result = await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3, 4, 5]) },
        mediaType: 'audio/mpeg',
        filename: 'test.mp3',
      });

      expect(result.byteSize).toBe(5);
    });

    it('should pass headers', async () => {
      const files = new MiniMaxFiles({
        provider: 'minimax.files',
        baseURL: TEST_BASE_URL,
        headers: () => ({
          Authorization: 'Bearer test-key',
          'Custom-Header': 'custom-value',
        }),
      });

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'audio/mpeg',
        filename: 'test.mp3',
        headers: {
          'Request-Header': 'request-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
        'custom-header': 'custom-value',
        'request-header': 'request-value',
      });
    });

    it('should handle base64 string data', async () => {
      const files = createFiles();

      const result = await files.uploadFile({
        data: { type: 'data', data: btoa('hello world') },
        mediaType: 'audio/mpeg',
        filename: 'test.mp3',
      });

      expect(result.providerReference).toEqual({ minimax: '12345' });
    });

    it('should handle different purpose values', async () => {
      const purposes = [
        'voice_clone',
        'prompt_audio',
        't2a_async_input',
      ] as const;

      for (let i = 0; i < purposes.length; i++) {
        const purpose = purposes[i];
        server.urls[FILES_URL].response = {
          type: 'json-value',
          body: mockFileResponse,
        };

        const files = createFiles();

        await files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
          mediaType: 'audio/mpeg',
          filename: 'test.mp3',
          providerOptions: {
            minimax: {
              purpose,
            },
          },
        });

        const multipart = await server.calls[i].requestBodyMultipart;
        expect(multipart).toMatchObject({
          purpose,
        });
      }
    });

    it('should handle custom purpose value', async () => {
      const files = createFiles();

      await files.uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'audio/mpeg',
        filename: 'test.mp3',
        providerOptions: {
          minimax: {
            purpose: 'custom_purpose',
          },
        },
      });

      const multipart = await server.calls[0].requestBodyMultipart;
      expect(multipart).toMatchObject({
        purpose: 'custom_purpose',
      });
    });

    it('should handle API errors', async () => {
      server.urls[FILES_URL].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Invalid file format',
            http_code: 400,
          },
          request_id: 'req-err-001',
        }),
      };

      const files = createFiles();

      await expect(
        files.uploadFile({
          data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
          mediaType: 'audio/mpeg',
          filename: 'test.mp3',
        }),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        statusCode: 400,
        message: 'Invalid file format',
      });
    });
  });

  describe('deleteFile', () => {
    it('should send POST to /v1/files/delete', async () => {
      const files = createFiles();

      await files.deleteFile({
        file: { minimax: '12345' },
      });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(DELETE_URL);
    });

    it('should send file_id and default purpose in request body', async () => {
      const files = createFiles();

      await files.deleteFile({
        file: { minimax: '12345' },
      });

      expect(await server.calls[0].requestBodyJson).toEqual({
        file_id: '12345',
        purpose: 't2a_async_input',
      });
    });

    it('should send custom purpose from providerOptions', async () => {
      const files = createFiles();

      await files.deleteFile({
        file: { minimax: '12345' },
        providerOptions: {
          minimax: {
            purpose: 'voice_clone',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        purpose: 'voice_clone',
      });
    });

    it('should return deleted false when response file_id does not match', async () => {
      server.urls[DELETE_URL].response = {
        type: 'json-value',
        body: {
          file_id: 99999,
          base_resp: {
            status_code: 0,
            status_msg: 'success',
          },
        },
      };

      const files = createFiles();

      const result = await files.deleteFile({
        file: { minimax: '12345' },
      });

      expect(result.deleted).toBe(false);
    });

    it('should throw InvalidArgumentError when minimax file id is missing', async () => {
      const files = createFiles();

      await expect(
        files.deleteFile({
          file: {},
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });
  });
});
