import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createApiKeyFetchFunction,
  createSigV4FetchFunction,
} from './anthropic-aws-fetch';

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

describe('createSigV4FetchFunction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs with service aws-external-anthropic and the anthropic-aws user-agent', async () => {
    const { AwsV4Signer } = await import('aws4fetch');
    const signerSpy = vi.spyOn(AwsV4Signer.prototype, 'sign');
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createSigV4FetchFunction(
      () => ({
        region: 'us-west-2',
        accessKeyId: 'akid',
        secretAccessKey: 'secret',
      }),
      dummyFetch,
    );

    await fetchFn(
      'https://aws-external-anthropic.us-west-2.api.aws/v1/messages',
      {
        method: 'POST',
        body: '{"hi":1}',
      },
    );

    const signerInstance = signerSpy.mock.instances[0] as {
      options: { service: string };
    };
    expect(signerInstance.options.service).toBe('aws-external-anthropic');

    const calledHeaders = dummyFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['user-agent']).toContain(
      'ai-sdk/anthropic-aws/0.0.0-test',
    );
  });
});

describe('createApiKeyFetchFunction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds x-api-key header and merges with existing headers', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createApiKeyFetchFunction(
      'sk-aws-anthropic-123',
      dummyFetch,
    );

    await fetchFn('https://example.com', {
      method: 'POST',
      body: '{"hi":1}',
      headers: { 'content-type': 'application/json' },
    });

    const calledHeaders = dummyFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['x-api-key']).toBe('sk-aws-anthropic-123');
    expect(calledHeaders['content-type']).toBe('application/json');
    expect(calledHeaders['user-agent']).toContain(
      'ai-sdk/anthropic-aws/0.0.0-test',
    );
  });
});
