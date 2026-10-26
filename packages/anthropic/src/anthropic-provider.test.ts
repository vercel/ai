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
        'oauth-2025-04-20',
        'request-beta',
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

  describe('workload identity federation environment variables', () => {
    const createFederationFetchMock = ({ expiresIn = 3600 } = {}) => {
      let exchanges = 0;
      return vi.fn().mockImplementation(async (url: string) =>
        url.endsWith('/oauth/token')
          ? Response.json({
              access_token: `sk-ant-oat01-${++exchanges}`,
              token_type: 'Bearer',
              expires_in: expiresIn,
            })
          : createSuccessfulResponse(),
      );
    };

    const exchangeCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
      fetchMock.mock.calls.filter(([url]) => url.endsWith('/oauth/token'));

    beforeEach(() => {
      vi.stubEnv('ANTHROPIC_API_KEY', undefined);
      vi.stubEnv('ANTHROPIC_FEDERATION_RULE_ID', 'fdrl_test');
      vi.stubEnv(
        'ANTHROPIC_ORGANIZATION_ID',
        '00000000-0000-0000-0000-000000000000',
      );
      vi.stubEnv('ANTHROPIC_SERVICE_ACCOUNT_ID', 'svac_test');
      vi.stubEnv('ANTHROPIC_WORKSPACE_ID', 'wrkspc_test');
      vi.stubEnv('ANTHROPIC_IDENTITY_TOKEN', 'identity-jwt');
      vi.stubEnv('ANTHROPIC_IDENTITY_TOKEN_FILE', undefined);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });

    it('exchanges the identity token and reuses the access token', async () => {
      const fetchMock = createFederationFetchMock();
      const model = createAnthropic({ fetch: fetchMock })(
        'claude-3-haiku-20240307',
      );

      await model.doGenerate({ prompt: TEST_PROMPT });
      await model.doGenerate({ prompt: TEST_PROMPT });

      const exchanges = exchangeCalls(fetchMock);
      expect(exchanges).toHaveLength(1);
      const [exchangeUrl, exchangeRequest] = exchanges[0]!;
      expect(exchangeUrl).toBe('https://api.anthropic.com/v1/oauth/token');
      expect(exchangeRequest.headers['anthropic-beta']).toBe(
        'oauth-2025-04-20,oidc-federation-2026-04-01',
      );
      expect(JSON.parse(exchangeRequest.body)).toEqual({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: 'identity-jwt',
        federation_rule_id: 'fdrl_test',
        organization_id: '00000000-0000-0000-0000-000000000000',
        service_account_id: 'svac_test',
        workspace_id: 'wrkspc_test',
      });

      const messageRequests = fetchMock.mock.calls.filter(([url]) =>
        url.endsWith('/messages'),
      );
      expect(messageRequests).toHaveLength(2);
      for (const [, requestOptions] of messageRequests) {
        expect(requestOptions.headers.authorization).toBe(
          'Bearer sk-ant-oat01-1',
        );
        expect(requestOptions.headers['x-api-key']).toBeUndefined();
        expect(requestOptions.headers['anthropic-beta']).toBe(
          'oauth-2025-04-20',
        );
      }
    });

    it('exchanges a new identity token shortly before the access token expires', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const fetchMock = createFederationFetchMock({ expiresIn: 600 });
      const model = createAnthropic({ fetch: fetchMock })(
        'claude-3-haiku-20240307',
      );

      await model.doGenerate({ prompt: TEST_PROMPT });
      vi.advanceTimersByTime(560_000);
      await model.doGenerate({ prompt: TEST_PROMPT });
      expect(exchangeCalls(fetchMock)).toHaveLength(1);

      vi.advanceTimersByTime(20_000);
      await model.doGenerate({ prompt: TEST_PROMPT });
      expect(exchangeCalls(fetchMock)).toHaveLength(2);
      const [, lastRequest] = fetchMock.mock.calls.at(-1)!;
      expect(lastRequest.headers.authorization).toBe('Bearer sk-ant-oat01-2');
    });

    it('shares one exchange between concurrent requests', async () => {
      const fetchMock = createFederationFetchMock();
      const model = createAnthropic({ fetch: fetchMock })(
        'claude-3-haiku-20240307',
      );

      await Promise.all([
        model.doGenerate({ prompt: TEST_PROMPT }),
        model.doGenerate({ prompt: TEST_PROMPT }),
      ]);

      expect(exchangeCalls(fetchMock)).toHaveLength(1);
    });

    it('reads the identity token from ANTHROPIC_IDENTITY_TOKEN_FILE', async () => {
      const { mkdtemp, writeFile } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const tokenFile = join(
        await mkdtemp(join(tmpdir(), 'anthropic-')),
        'token',
      );
      await writeFile(tokenFile, 'file-identity-jwt\n');
      vi.stubEnv('ANTHROPIC_IDENTITY_TOKEN_FILE', tokenFile);

      const fetchMock = createFederationFetchMock();
      await createAnthropic({ fetch: fetchMock })(
        'claude-3-haiku-20240307',
      ).doGenerate({ prompt: TEST_PROMPT });

      const [, exchangeRequest] = exchangeCalls(fetchMock)[0]!;
      expect(JSON.parse(exchangeRequest.body).assertion).toBe(
        'file-identity-jwt',
      );
    });

    it('prefers ANTHROPIC_API_KEY', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'env-api-key');
      const fetchMock = createFederationFetchMock();

      await createAnthropic({ fetch: fetchMock })(
        'claude-3-haiku-20240307',
      ).doGenerate({ prompt: TEST_PROMPT });

      expect(exchangeCalls(fetchMock)).toHaveLength(0);
      const [, requestOptions] = fetchMock.mock.calls[0]!;
      expect(requestOptions.headers['x-api-key']).toBe('env-api-key');
      expect(requestOptions.headers.authorization).toBeUndefined();
      expect(requestOptions.headers['anthropic-beta']).toBeUndefined();
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
