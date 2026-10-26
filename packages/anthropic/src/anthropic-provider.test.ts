/* eslint-disable turbo/no-undeclared-env-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidArgumentError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { createAnthropic } from './anthropic-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const createSuccessfulResponse = () =>
  new Response(
    JSON.stringify({
      type: 'message',
      id: 'msg_123',
      model: 'claude-3-haiku-20240307',
      content: [{ type: 'text', text: 'Hi' }],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );

const createFetchMock = () =>
  vi.fn().mockResolvedValue(createSuccessfulResponse());

describe('createAnthropic', () => {
  describe('baseURL configuration', () => {
    const originalBaseUrl = process.env.ANTHROPIC_BASE_URL;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      if (originalBaseUrl === undefined) {
        delete process.env.ANTHROPIC_BASE_URL;
      } else {
        process.env.ANTHROPIC_BASE_URL = originalBaseUrl;
      }
    });

    it('uses the default Anthropic base URL when not provided', async () => {
      delete process.env.ANTHROPIC_BASE_URL;

      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        apiKey: 'test-api-key',
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe('https://api.anthropic.com/v1/messages');
    });

    it('uses ANTHROPIC_BASE_URL when set', async () => {
      process.env.ANTHROPIC_BASE_URL = 'https://proxy.anthropic.example/v1/';

      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        apiKey: 'test-api-key',
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe('https://proxy.anthropic.example/v1/messages');
    });

    it('normalizes a bare Anthropic API URL from ANTHROPIC_BASE_URL', async () => {
      process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com/';

      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        apiKey: 'test-api-key',
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe('https://api.anthropic.com/v1/messages');
    });

    it('normalizes a bare Anthropic API URL from the baseURL option', async () => {
      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        apiKey: 'test-api-key',
        baseURL: 'https://api.anthropic.com/',
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe('https://api.anthropic.com/v1/messages');
    });

    it('prefers the baseURL option over ANTHROPIC_BASE_URL', async () => {
      process.env.ANTHROPIC_BASE_URL = 'https://env.anthropic.example/v1';

      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        apiKey: 'test-api-key',
        baseURL: 'https://option.anthropic.example/v1/',
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe('https://option.anthropic.example/v1/messages');
    });

    it('rejects an empty baseURL option during provider creation', () => {
      try {
        createAnthropic({
          apiKey: 'test-api-key',
          baseURL: '',
        });
      } catch (error) {
        expect(InvalidArgumentError.isInstance(error)).toBe(true);
        expect(error).toMatchObject({
          argument: 'baseURL',
          message: 'baseURL must be a non-empty string.',
        });
        return;
      }

      throw new Error('Expected createAnthropic to reject an empty base URL.');
    });
  });
});

describe('anthropic provider - authentication', () => {
  describe('authToken option', () => {
    it('sends Authorization Bearer header when authToken is provided', async () => {
      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        authToken: 'test-auth-token',
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, requestOptions] = fetchMock.mock.calls[0]!;
      expect(requestOptions.headers.authorization).toBe(
        'Bearer test-auth-token',
      );
      expect(requestOptions.headers['x-api-key']).toBeUndefined();
      expect(requestOptions.headers['anthropic-beta']).toBeUndefined();
    });
  });

  describe('authToken function', () => {
    it('resolves the token for each request and adds the OAuth beta', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(async () => createSuccessfulResponse());
      let token = 'token-1';
      const provider = createAnthropic({
        authToken: async () => token,
        fetch: fetchMock,
      });
      const model = provider('claude-3-haiku-20240307');

      await model.doGenerate({ prompt: TEST_PROMPT });
      token = 'token-2';
      await model.doGenerate({ prompt: TEST_PROMPT });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, firstRequest] = fetchMock.mock.calls[0]!;
      const [, secondRequest] = fetchMock.mock.calls[1]!;
      expect(firstRequest.headers.authorization).toBe('Bearer token-1');
      expect(secondRequest.headers.authorization).toBe('Bearer token-2');
      expect(firstRequest.headers['x-api-key']).toBeUndefined();
      expect(firstRequest.headers['anthropic-beta']).toBe('oauth-2025-04-20');
    });

    it('keeps other betas alongside the OAuth beta', async () => {
      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        authToken: async () => 'test-auth-token',
        headers: { 'anthropic-beta': 'provider-beta' },
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
        headers: { 'anthropic-beta': 'request-beta' },
      });

      const [, requestOptions] = fetchMock.mock.calls[0]!;
      expect(requestOptions.headers['anthropic-beta'].split(',')).toEqual([
        'provider-beta',
        'request-beta',
        'oauth-2025-04-20',
      ]);
    });

    it('adds the OAuth beta to file uploads', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json({
          id: 'file_123',
          type: 'file',
          filename: 'test.txt',
          mime_type: 'text/plain',
          size_bytes: 3,
          created_at: '2025-04-14T12:00:00Z',
        }),
      );
      const provider = createAnthropic({
        authToken: async () => 'test-auth-token',
        fetch: fetchMock,
      });

      await provider.files().uploadFile({
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
        mediaType: 'text/plain',
        providerOptions: {},
      });

      const [, requestOptions] = fetchMock.mock.calls[0]!;
      expect(requestOptions.headers.authorization).toBe(
        'Bearer test-auth-token',
      );
      expect(requestOptions.headers['anthropic-beta']).toBe(
        'files-api-2025-04-14,oauth-2025-04-20',
      );
    });

    it('adds the OAuth beta when starting a batch', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json({
          id: 'msgbatch_123',
          type: 'message_batch',
          processing_status: 'in_progress',
          request_counts: {
            processing: 1,
            succeeded: 0,
            errored: 0,
            canceled: 0,
            expired: 0,
          },
          results_url: null,
          created_at: '2025-04-14T12:00:00Z',
          expires_at: '2025-04-15T12:00:00Z',
          ended_at: null,
        }),
      );
      const provider = createAnthropic({
        authToken: async () => 'test-auth-token',
        fetch: fetchMock,
      });

      await provider.experimental_batch().doStartBatch({
        requests: [
          {
            id: 'request-1',
            type: 'text',
            modelId: 'claude-3-haiku-20240307',
            options: { prompt: TEST_PROMPT },
          },
        ],
      });

      const [, requestOptions] = fetchMock.mock.calls[0]!;
      expect(requestOptions.headers.authorization).toBe(
        'Bearer test-auth-token',
      );
      expect(requestOptions.headers['anthropic-beta']).toBe('oauth-2025-04-20');
    });
  });

  describe('apiKey and authToken conflict', () => {
    it('throws error when both apiKey and authToken options are provided', () => {
      expect(() =>
        createAnthropic({
          apiKey: 'test-api-key',
          authToken: 'test-auth-token',
        }),
      ).toThrow(
        'Both apiKey and authToken were provided. Please use only one authentication method.',
      );
    });
  });
});

describe('anthropic provider - custom provider name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use custom provider name when specified', () => {
    const provider = createAnthropic({
      name: 'my-claude-proxy',
      apiKey: 'test-api-key',
    });

    const model = provider('claude-3-haiku-20240307');
    expect(model.provider).toBe('my-claude-proxy');
  });

  it('should default to anthropic.messages when name not specified', () => {
    const provider = createAnthropic({
      apiKey: 'test-api-key',
    });

    const model = provider('claude-3-haiku-20240307');
    expect(model.provider).toBe('anthropic.messages');
  });
});

describe('anthropic provider - supportedUrls', () => {
  it('should support image/* URLs', async () => {
    const provider = createAnthropic({
      apiKey: 'test-api-key',
    });

    const model = provider('claude-3-haiku-20240307');
    const supportedUrls = await model.supportedUrls;

    expect(supportedUrls['image/*']).toBeDefined();
    expect(
      supportedUrls['image/*']![0]!.test('https://example.com/image.png'),
    ).toBe(true);
  });

  it('should support application/pdf URLs', async () => {
    const provider = createAnthropic({
      apiKey: 'test-api-key',
    });

    const model = provider('claude-3-haiku-20240307');
    const supportedUrls = await model.supportedUrls;

    expect(supportedUrls['application/pdf']).toBeDefined();
    expect(
      supportedUrls['application/pdf']![0]!.test(
        'https://arxiv.org/pdf/2401.00001',
      ),
    ).toBe(true);
  });
});
