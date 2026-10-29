/* eslint-disable turbo/no-undeclared-env-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidArgumentError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import {
  SerializationError,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { AnthropicLanguageModel } from './anthropic-language-model';
import {
  createAnthropic,
  type AnthropicProviderSettings,
} from './anthropic-provider';

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
  vi.fn().mockImplementation(createSuccessfulResponse);

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
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('authToken option', () => {
    it('preserves static bearer authentication without enabling OAuth betas', async () => {
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

    it.each([
      ['synchronous', (): string => 'test-auth-token'],
      ['asynchronous', async (): Promise<string> => 'test-auth-token'],
    ] as const)(
      'accepts a %s token supplier without an API key',
      async (_, authToken) => {
        const fetchMock = createFetchMock();
        const tokenSupplier = vi.fn(authToken);
        const provider = createAnthropic({
          authToken: tokenSupplier,
          fetch: fetchMock,
        });
        const model = provider('claude-3-haiku-20240307');

        expect(tokenSupplier).not.toHaveBeenCalled();

        await model.doGenerate({ prompt: TEST_PROMPT });

        expect(tokenSupplier).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]![1].headers).toMatchObject({
          authorization: 'Bearer test-auth-token',
        });
        expect(
          fetchMock.mock.calls[0]![1].headers['anthropic-beta'],
        ).toBeUndefined();
        expect(
          fetchMock.mock.calls[0]![1].headers['x-api-key'],
        ).toBeUndefined();
      },
    );

    it('accepts a token promise', async () => {
      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        authToken: Promise.resolve('test-auth-token'),
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock.mock.calls[0]![1].headers.authorization).toBe(
        'Bearer test-auth-token',
      );
    });

    it('gets a fresh token for each generation with the same model', async () => {
      const fetchMock = createFetchMock();
      const authToken = vi
        .fn()
        .mockResolvedValueOnce('first-token')
        .mockResolvedValueOnce('refreshed-token');
      const provider = createAnthropic({ authToken, fetch: fetchMock });
      const model = provider('claude-3-haiku-20240307');

      await model.doGenerate({ prompt: TEST_PROMPT });
      await model.doGenerate({ prompt: TEST_PROMPT });

      expect(authToken).toHaveBeenCalledTimes(2);
      expect(
        fetchMock.mock.calls.map(
          ([, options]) => options.headers.authorization,
        ),
      ).toEqual(['Bearer first-token', 'Bearer refreshed-token']);
    });

    it('gets a fresh token for each stream with the same model', async () => {
      const fetchMock = vi.fn().mockImplementation(
        () =>
          new Response('', {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      );
      const authToken = vi
        .fn()
        .mockResolvedValueOnce('first-token')
        .mockResolvedValueOnce('refreshed-token');
      const provider = createAnthropic({ authToken, fetch: fetchMock });
      const model = provider('claude-3-haiku-20240307');

      const first = await model.doStream({ prompt: TEST_PROMPT });
      await first.stream.cancel();
      const second = await model.doStream({ prompt: TEST_PROMPT });
      await second.stream.cancel();

      expect(authToken).toHaveBeenCalledTimes(2);
      expect(
        fetchMock.mock.calls.map(
          ([, options]) => options.headers.authorization,
        ),
      ).toEqual(['Bearer first-token', 'Bearer refreshed-token']);
      expect(
        fetchMock.mock.calls[1]![1].headers['anthropic-beta'],
      ).toBeUndefined();
    });

    it('propagates token supplier errors without sending an API request', async () => {
      const fetchMock = createFetchMock();
      const error = new Error('Token exchange failed');
      const provider = createAnthropic({
        authToken: vi.fn().mockRejectedValue(error),
        fetch: fetchMock,
      });

      await expect(
        provider('claude-3-haiku-20240307').doGenerate({
          prompt: TEST_PROMPT,
        }),
      ).rejects.toBe(error);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('merges the OAuth beta with provider, request, and feature betas', async () => {
      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        authToken: async () => 'test-auth-token',
        headers: {
          'anthropic-beta': 'provider-beta,oauth-2025-04-20',
        },
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
        headers: { 'anthropic-beta': 'request-beta,oauth-2025-04-20' },
        providerOptions: {
          anthropic: { anthropicBeta: ['feature-beta'] },
        },
      });

      const betas =
        fetchMock.mock.calls[0]![1].headers['anthropic-beta'].split(',').sort();
      expect(betas).toEqual([
        'feature-beta',
        'oauth-2025-04-20',
        'provider-beta',
        'request-beta',
      ]);
    });

    it('prefers the auth token over an API key from the environment', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'environment-api-key');
      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        authToken: async () => 'test-auth-token',
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock.mock.calls[0]![1].headers.authorization).toBe(
        'Bearer test-auth-token',
      );
      expect(fetchMock.mock.calls[0]![1].headers['x-api-key']).toBeUndefined();
    });
  });

  it('keeps API key authentication without enabling the OAuth beta', async () => {
    const fetchMock = createFetchMock();
    const provider = createAnthropic({
      apiKey: 'test-api-key',
      fetch: fetchMock,
    });

    await provider('claude-3-haiku-20240307').doGenerate({
      prompt: TEST_PROMPT,
    });

    const headers = fetchMock.mock.calls[0]![1].headers;
    expect(headers['x-api-key']).toBe('test-api-key');
    expect(headers.authorization).toBeUndefined();
    expect(headers['anthropic-beta']).toBeUndefined();
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

describe('anthropic provider - workflow serialization', () => {
  const baseURL = 'https://anthropic-proxy.example/v1';
  const modelId = 'claude-3-haiku-20240307';
  let fetchMock: ReturnType<typeof createFetchMock>;

  function roundTrip(settings: AnthropicProviderSettings) {
    const original = createAnthropic({ baseURL, ...settings })(
      modelId,
    ) as AnthropicLanguageModel;
    const serialized = AnthropicLanguageModel[WORKFLOW_SERIALIZE](original);

    return AnthropicLanguageModel[WORKFLOW_DESERIALIZE](
      serialized as unknown as Parameters<
        (typeof AnthropicLanguageModel)[typeof WORKFLOW_DESERIALIZE]
      >[0],
    );
  }

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'environment-api-key');
    fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each<{
    name: string;
    settings: AnthropicProviderSettings;
    expectedAuthHeaders: Record<string, string | undefined>;
  }>([
    {
      name: 'an explicit API key',
      settings: { apiKey: 'explicit-api-key' },
      expectedAuthHeaders: {
        'x-api-key': 'explicit-api-key',
        authorization: undefined,
      },
    },
    {
      name: 'an environment API key',
      settings: {},
      expectedAuthHeaders: {
        'x-api-key': 'environment-api-key',
        authorization: undefined,
      },
    },
    {
      name: 'a static bearer token',
      settings: { authToken: 'static-token' },
      expectedAuthHeaders: {
        'x-api-key': undefined,
        authorization: 'Bearer static-token',
      },
    },
  ])(
    'preserves $name and provider settings across a round trip',
    async ({ settings, expectedAuthHeaders }) => {
      const restored = roundTrip({
        ...settings,
        name: 'custom.messages',
        headers: {
          'anthropic-beta': 'provider-beta',
          'x-custom-header': 'custom-value',
        },
      });

      vi.stubEnv('ANTHROPIC_API_KEY', 'changed-environment-api-key');

      expect(restored.provider).toBe('custom.messages');
      expect(restored.modelId).toBe(modelId);

      const result = await restored.doGenerate({
        prompt: TEST_PROMPT,
        headers: { 'anthropic-beta': 'request-beta' },
      });

      expect(result.content).toEqual([{ type: 'text', text: 'Hi' }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]![0]).toBe(`${baseURL}/messages`);
      const headers = fetchMock.mock.calls[0]![1].headers;
      for (const [name, value] of Object.entries(expectedAuthHeaders)) {
        expect(headers[name]).toBe(value);
      }
      expect(headers['x-custom-header']).toBe('custom-value');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['anthropic-beta'].split(',').sort()).toEqual([
        'provider-beta',
        'request-beta',
      ]);
    },
  );

  it('snapshots a synchronous token supplier when serializing', async () => {
    const authToken = vi
      .fn()
      .mockReturnValueOnce('serialized-token')
      .mockReturnValue('later-token');
    const restored = roundTrip({ authToken });

    expect(authToken).toHaveBeenCalledTimes(1);

    await restored.doGenerate({ prompt: TEST_PROMPT });
    await restored.doGenerate({ prompt: TEST_PROMPT });

    expect(authToken).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.map(([, options]) => options.headers.authorization),
    ).toEqual(['Bearer serialized-token', 'Bearer serialized-token']);
  });

  it.each([
    { name: 'a token promise', authToken: Promise.resolve('token') },
    { name: 'an asynchronous token supplier', authToken: async () => 'token' },
  ])('rejects synchronous serialization of $name', ({ authToken }) => {
    expect(() => roundTrip({ authToken })).toThrow(SerializationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
