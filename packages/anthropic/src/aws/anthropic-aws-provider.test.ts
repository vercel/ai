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
      return { headers, options: this.options };
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
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

describe('createAnthropicAws', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_REGION', 'us-west-2');
    vi.stubEnv('ANTHROPIC_AWS_WORKSPACE_ID', 'wrkspc_default');
    vi.stubEnv('ANTHROPIC_AWS_API_KEY', undefined);
    vi.stubEnv('AWS_ACCESS_KEY_ID', undefined);
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', undefined);
    vi.stubEnv('AWS_SESSION_TOKEN', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('templates the base URL from the region', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulResponse());
    const provider = createAnthropicAws({
      region: 'us-east-1',
      workspaceId: 'wrkspc_test',
      apiKey: 'sk-aws-test',
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://aws-external-anthropic.us-east-1.api.aws/v1/messages',
    );
  });

  it('sends the anthropic-workspace-id header on every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulResponse());
    const provider = createAnthropicAws({
      region: 'us-west-2',
      workspaceId: 'wrkspc_unique',
      apiKey: 'sk-aws-test',
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(headers['anthropic-workspace-id']).toBe('wrkspc_unique');
  });

  it('uses x-api-key authentication when apiKey is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulResponse());
    const provider = createAnthropicAws({
      region: 'us-west-2',
      workspaceId: 'wrkspc_test',
      apiKey: 'sk-aws-platform-key',
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(headers['x-api-key']).toBe('sk-aws-platform-key');
    expect(headers['authorization']).toBeUndefined();
  });

  it('uses SigV4 authentication when apiKey is not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulResponse());
    const provider = createAnthropicAws({
      region: 'us-west-2',
      workspaceId: 'wrkspc_test',
      accessKeyId: 'akid',
      secretAccessKey: 'secret',
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(headers['authorization']).toBe('AWS4-HMAC-SHA256 Credential=test');
    expect(headers['x-amz-date']).toBe('20240315T000000Z');
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('throws when region is not set anywhere', () => {
    vi.stubEnv('AWS_REGION', undefined);
    const provider = createAnthropicAws({
      workspaceId: 'wrkspc_test',
      apiKey: 'k',
    });
    expect(() => provider('claude-sonnet-4-6')).toThrow(/region/i);
  });

  it('throws when workspaceId is not set anywhere', async () => {
    vi.stubEnv('ANTHROPIC_AWS_WORKSPACE_ID', undefined);
    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulResponse());
    const provider = createAnthropicAws({
      region: 'us-west-2',
      apiKey: 'k',
      fetch: fetchMock,
    });
    await expect(
      provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT }),
    ).rejects.toThrow(/workspace/i);
  });

  it('reads region and workspaceId from environment variables', async () => {
    vi.stubEnv('AWS_REGION', 'eu-west-1');
    vi.stubEnv('ANTHROPIC_AWS_WORKSPACE_ID', 'wrkspc_from_env');
    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulResponse());
    const provider = createAnthropicAws({
      apiKey: 'sk-aws-test',
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://aws-external-anthropic.eu-west-1.api.aws/v1/messages',
    );
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(headers['anthropic-workspace-id']).toBe('wrkspc_from_env');
  });

  it('honors a credentialProvider for dynamic SigV4 credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulResponse());
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

  it('merges custom headers with the workspace-id header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulResponse());
    const provider = createAnthropicAws({
      region: 'us-west-2',
      workspaceId: 'wrkspc_test',
      apiKey: 'sk-aws-test',
      headers: { 'x-custom': 'value' },
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(headers['anthropic-workspace-id']).toBe('wrkspc_test');
    expect(headers['x-custom']).toBe('value');
  });

  it('honors a baseURL override', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulResponse());
    const provider = createAnthropicAws({
      region: 'us-west-2',
      workspaceId: 'wrkspc_test',
      apiKey: 'sk-aws-test',
      baseURL: 'https://proxy.example.com/v1',
      fetch: fetchMock,
    });

    await provider('claude-sonnet-4-6').doGenerate({ prompt: TEST_PROMPT });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://proxy.example.com/v1/messages');
  });
});
