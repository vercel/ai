import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicAws } from './anthropic-aws-provider';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('aws4fetch', () => {
  class MockAwsV4Signer {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
    async sign() {
      const headers = new Headers();
      headers.set('x-amz-date', '20240315T000000Z');
      headers.set('authorization', 'AWS4-HMAC-SHA256 Credential=test');
      return { headers };
    }
  }
  return { AwsV4Signer: MockAwsV4Signer };
});

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const createSuccessfulResponse = () =>
  new Response(
    JSON.stringify({
      type: 'message',
      id: 'msg_123',
      model: 'claude-sonnet-4-6',
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

const stubDefaultEnv = () => {
  vi.stubEnv('AWS_REGION', 'us-west-2');
  vi.stubEnv('ANTHROPIC_AWS_WORKSPACE_ID', 'wrkspc_default');
  vi.stubEnv('ANTHROPIC_AWS_API_KEY', undefined);
  vi.stubEnv('AWS_ACCESS_KEY_ID', undefined);
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', undefined);
  vi.stubEnv('AWS_SESSION_TOKEN', undefined);
};

describe('createAnthropicAws', () => {
  describe('baseURL configuration', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      stubDefaultEnv();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('uses the default Claude Platform on AWS base URL with region templating', async () => {
      const fetchMock = createFetchMock();
      const provider = createAnthropicAws({
        region: 'us-east-1',
        workspaceId: 'wrkspc_test',
        apiKey: 'test-api-key',
        fetch: fetchMock,
      });

      await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe(
        'https://aws-external-anthropic.us-east-1.api.aws/v1/messages',
      );
    });

    it('reads AWS_REGION from the environment when region option is omitted', async () => {
      vi.stubEnv('AWS_REGION', 'eu-west-1');
      const fetchMock = createFetchMock();
      const provider = createAnthropicAws({
        workspaceId: 'wrkspc_test',
        apiKey: 'test-api-key',
        fetch: fetchMock,
      });

      await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe(
        'https://aws-external-anthropic.eu-west-1.api.aws/v1/messages',
      );
    });

    it('prefers the baseURL option over the default template', async () => {
      const fetchMock = createFetchMock();
      const provider = createAnthropicAws({
        region: 'us-west-2',
        workspaceId: 'wrkspc_test',
        apiKey: 'test-api-key',
        baseURL: 'https://proxy.example.com/v1/',
        fetch: fetchMock,
      });

      await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe('https://proxy.example.com/v1/messages');
    });
  });
});

describe('anthropicAws provider - authentication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubDefaultEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('apiKey option', () => {
    it('sends x-api-key header when apiKey is provided', async () => {
      const fetchMock = createFetchMock();
      const provider = createAnthropicAws({
        region: 'us-west-2',
        workspaceId: 'wrkspc_test',
        apiKey: 'sk-aws-platform-key',
        fetch: fetchMock,
      });

      await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

      const [, requestOptions] = fetchMock.mock.calls[0]!;
      expect(requestOptions.headers['x-api-key']).toBe('sk-aws-platform-key');
      expect(requestOptions.headers.authorization).toBeUndefined();
    });

    it('reads apiKey from ANTHROPIC_AWS_API_KEY when option is omitted', async () => {
      vi.stubEnv('ANTHROPIC_AWS_API_KEY', 'sk-from-env');
      const fetchMock = createFetchMock();
      const provider = createAnthropicAws({
        region: 'us-west-2',
        workspaceId: 'wrkspc_test',
        fetch: fetchMock,
      });

      await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

      const [, requestOptions] = fetchMock.mock.calls[0]!;
      expect(requestOptions.headers['x-api-key']).toBe('sk-from-env');
    });
  });

  describe('SigV4 path', () => {
    it('signs requests with SigV4 when apiKey is not provided', async () => {
      const fetchMock = createFetchMock();
      const provider = createAnthropicAws({
        region: 'us-west-2',
        workspaceId: 'wrkspc_test',
        accessKeyId: 'akid',
        secretAccessKey: 'secret',
        fetch: fetchMock,
      });

      await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

      const [, requestOptions] = fetchMock.mock.calls[0]!;
      expect(requestOptions.headers.authorization).toBe(
        'AWS4-HMAC-SHA256 Credential=test',
      );
      expect(requestOptions.headers['x-amz-date']).toBe('20240315T000000Z');
      expect(requestOptions.headers['x-api-key']).toBeUndefined();
    });

    it('honors a credentialProvider for dynamic SigV4 credentials', async () => {
      const fetchMock = createFetchMock();
      const credentialProvider = vi.fn().mockResolvedValue({
        accessKeyId: 'dynamic-akid',
        secretAccessKey: 'dynamic-secret',
        sessionToken: 'dynamic-session',
      });
      const provider = createAnthropicAws({
        region: 'us-west-2',
        workspaceId: 'wrkspc_test',
        credentialProvider,
        fetch: fetchMock,
      });

      await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

      expect(credentialProvider).toHaveBeenCalled();
    });

    it('throws a guided error when SigV4 credentials are missing', async () => {
      const provider = createAnthropicAws({
        region: 'us-west-2',
        workspaceId: 'wrkspc_test',
      });

      await expect(
        provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT }),
      ).rejects.toThrow(/AWS SigV4 authentication requires AWS credentials/);
    });

    it('wraps credentialProvider rejections with a guided message', async () => {
      const provider = createAnthropicAws({
        region: 'us-west-2',
        workspaceId: 'wrkspc_test',
        credentialProvider: async () => {
          throw new Error('STS denied');
        },
      });

      await expect(
        provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT }),
      ).rejects.toThrow(/AWS credential provider failed: STS denied/);
    });
  });
});

describe('anthropicAws provider - workspaceId', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubDefaultEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends the anthropic-version header on every request', async () => {
    const fetchMock = createFetchMock();
    const provider = createAnthropicAws({
      region: 'us-west-2',
      workspaceId: 'wrkspc_test',
      apiKey: 'test-api-key',
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const [, requestOptions] = fetchMock.mock.calls[0]!;
    expect(requestOptions.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('sends the anthropic-workspace-id header on every request', async () => {
    const fetchMock = createFetchMock();
    const provider = createAnthropicAws({
      region: 'us-west-2',
      workspaceId: 'wrkspc_unique',
      apiKey: 'test-api-key',
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const [, requestOptions] = fetchMock.mock.calls[0]!;
    expect(requestOptions.headers['anthropic-workspace-id']).toBe(
      'wrkspc_unique',
    );
  });

  it('reads workspaceId from ANTHROPIC_AWS_WORKSPACE_ID when option is omitted', async () => {
    vi.stubEnv('ANTHROPIC_AWS_WORKSPACE_ID', 'wrkspc_from_env');
    const fetchMock = createFetchMock();
    const provider = createAnthropicAws({
      region: 'us-west-2',
      apiKey: 'test-api-key',
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const [, requestOptions] = fetchMock.mock.calls[0]!;
    expect(requestOptions.headers['anthropic-workspace-id']).toBe(
      'wrkspc_from_env',
    );
  });

  it('throws when workspaceId is not resolvable at request time', async () => {
    vi.stubEnv('ANTHROPIC_AWS_WORKSPACE_ID', undefined);
    const fetchMock = createFetchMock();
    const provider = createAnthropicAws({
      region: 'us-west-2',
      apiKey: 'test-api-key',
      fetch: fetchMock,
    });

    await expect(
      provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT }),
    ).rejects.toThrow(/workspace/i);
  });
});

describe('anthropicAws provider - region', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubDefaultEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when region is not resolvable at model creation time', () => {
    vi.stubEnv('AWS_REGION', undefined);
    const provider = createAnthropicAws({
      workspaceId: 'wrkspc_test',
      apiKey: 'test-api-key',
    });
    expect(() => provider('claude-sonnet-4-6')).toThrow(/region/i);
  });
});

describe('anthropicAws provider - headers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubDefaultEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('merges custom headers with the workspace-id header', async () => {
    const fetchMock = createFetchMock();
    const provider = createAnthropicAws({
      region: 'us-west-2',
      workspaceId: 'wrkspc_test',
      apiKey: 'test-api-key',
      headers: { 'x-custom': 'value' },
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const [, requestOptions] = fetchMock.mock.calls[0]!;
    expect(requestOptions.headers['anthropic-workspace-id']).toBe(
      'wrkspc_test',
    );
    expect(requestOptions.headers['x-custom']).toBe('value');
  });
});

describe('anthropicAws provider - supportedUrls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubDefaultEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should support image/* URLs', async () => {
    const provider = createAnthropicAws({
      region: 'us-west-2',
      workspaceId: 'wrkspc_test',
      apiKey: 'test-api-key',
    });

    const model = provider('claude-sonnet-4-6');
    const supportedUrls = await model.supportedUrls;

    expect(supportedUrls['image/*']).toBeDefined();
    expect(
      supportedUrls['image/*']![0]!.test('https://example.com/image.png'),
    ).toBe(true);
  });

  it('should support application/pdf URLs', async () => {
    const provider = createAnthropicAws({
      region: 'us-west-2',
      workspaceId: 'wrkspc_test',
      apiKey: 'test-api-key',
    });

    const model = provider('claude-sonnet-4-6');
    const supportedUrls = await model.supportedUrls;

    expect(supportedUrls['application/pdf']).toBeDefined();
    expect(
      supportedUrls['application/pdf']![0]!.test(
        'https://arxiv.org/pdf/2401.00001',
      ),
    ).toBe(true);
  });
});
