import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createApiKeyFetchFunction,
  createSigV4FetchFunction,
} from './anthropic-aws-fetch';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    getRuntimeEnvironmentUserAgent: vi.fn(() => 'runtime/testenv'),
  };
});

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
      if (this.options.sessionToken) {
        headers.set(
          'x-amz-security-token',
          this.options.sessionToken as string,
        );
      }
      return { headers, options: this.options };
    }
  }
  return { AwsV4Signer: MockAwsV4Signer };
});

describe('createSigV4FetchFunction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs POST requests using the aws-external-anthropic service', async () => {
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
        headers: { 'content-type': 'application/json' },
      },
    );

    expect(signerSpy).toHaveBeenCalled();
    const signerInstance = signerSpy.mock.instances[0] as unknown as {
      options: { service: string; region: string };
    };
    expect(signerInstance.options.service).toBe('aws-external-anthropic');
    expect(signerInstance.options.region).toBe('us-west-2');

    const calledHeaders = dummyFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['x-amz-date']).toBe('20240315T000000Z');
    expect(calledHeaders['authorization']).toBe(
      'AWS4-HMAC-SHA256 Credential=test',
    );
    expect(calledHeaders['user-agent']).toContain('ai-sdk/anthropic-aws/');
  });

  it('includes session token when provided', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createSigV4FetchFunction(
      () => ({
        region: 'us-west-2',
        accessKeyId: 'akid',
        secretAccessKey: 'secret',
        sessionToken: 'session-token',
      }),
      dummyFetch,
    );

    await fetchFn('https://example.com', {
      method: 'POST',
      body: '{"hi":1}',
    });

    const calledHeaders = dummyFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['x-amz-security-token']).toBe('session-token');
  });

  it('bypasses signing for non-POST requests', async () => {
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

    await fetchFn('https://example.com', { method: 'GET' });
    expect(signerSpy).not.toHaveBeenCalled();
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
    expect(calledHeaders['user-agent']).toContain('ai-sdk/anthropic-aws/');
  });
});
