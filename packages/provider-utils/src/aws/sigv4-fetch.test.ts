import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSigV4FetchFunction } from './sigv4-fetch';

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
      return { headers };
    }
  }
  return { AwsV4Signer: MockAwsV4Signer };
});

describe('createSigV4FetchFunction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs POST requests with the configured service and region', async () => {
    const { AwsV4Signer } = await import('aws4fetch');
    const signerSpy = vi.spyOn(AwsV4Signer.prototype, 'sign');
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createSigV4FetchFunction(
      () => ({
        region: 'us-west-2',
        accessKeyId: 'akid',
        secretAccessKey: 'secret',
      }),
      {
        service: 'aws-external-anthropic',
        userAgentSuffix: 'ai-sdk/anthropic-aws/test',
        fetch: dummyFetch,
      },
    );

    await fetchFn('https://example.com/v1/messages', {
      method: 'POST',
      body: '{"hi":1}',
      headers: { 'content-type': 'application/json' },
    });

    const signerInstance = signerSpy.mock.instances[0] as {
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
    expect(calledHeaders['user-agent']).toContain('ai-sdk/anthropic-aws/test');
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
      {
        service: 'bedrock',
        userAgentSuffix: 'ai-sdk/amazon-bedrock/test',
        fetch: dummyFetch,
      },
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
      {
        service: 'bedrock',
        userAgentSuffix: 'ai-sdk/amazon-bedrock/test',
        fetch: dummyFetch,
      },
    );

    await fetchFn('https://example.com', { method: 'GET' });
    expect(signerSpy).not.toHaveBeenCalled();
  });

  it('bypasses signing for POST requests without a body', async () => {
    const { AwsV4Signer } = await import('aws4fetch');
    const signerSpy = vi.spyOn(AwsV4Signer.prototype, 'sign');
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createSigV4FetchFunction(
      () => ({
        region: 'us-west-2',
        accessKeyId: 'akid',
        secretAccessKey: 'secret',
      }),
      {
        service: 'bedrock',
        userAgentSuffix: 'ai-sdk/amazon-bedrock/test',
        fetch: dummyFetch,
      },
    );

    await fetchFn('https://example.com', { method: 'POST' });
    expect(signerSpy).not.toHaveBeenCalled();
  });

  it('handles non-string body by stringifying it', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createSigV4FetchFunction(
      () => ({
        region: 'us-west-2',
        accessKeyId: 'akid',
        secretAccessKey: 'secret',
      }),
      {
        service: 'bedrock',
        userAgentSuffix: 'ai-sdk/amazon-bedrock/test',
        fetch: dummyFetch,
      },
    );

    await fetchFn('https://example.com', {
      method: 'POST',
      body: { field: 'value' } as BodyInit,
    });

    expect(dummyFetch.mock.calls[0]![1]!.body).toBe(
      JSON.stringify({ field: 'value' }),
    );
  });

  it('propagates rejection from async credential providers', async () => {
    const dummyFetch = vi.fn();
    const fetchFn = createSigV4FetchFunction(
      () => Promise.reject(new Error('credential fetch failed')),
      {
        service: 'bedrock',
        userAgentSuffix: 'ai-sdk/amazon-bedrock/test',
        fetch: dummyFetch,
      },
    );

    await expect(
      fetchFn('https://example.com', {
        method: 'POST',
        body: '{"hi":1}',
      }),
    ).rejects.toThrow('credential fetch failed');
    expect(dummyFetch).not.toHaveBeenCalled();
  });

  it('resolves default fetch lazily so runtime patches are honored', async () => {
    const originalFetch = globalThis.fetch;
    const initialFetch = vi.fn().mockResolvedValue(new Response('initial'));
    const patchedFetch = vi.fn().mockResolvedValue(new Response('patched'));

    globalThis.fetch = initialFetch;
    const fetchFn = createSigV4FetchFunction(
      () => ({
        region: 'us-west-2',
        accessKeyId: 'akid',
        secretAccessKey: 'secret',
      }),
      {
        service: 'bedrock',
        userAgentSuffix: 'ai-sdk/amazon-bedrock/test',
      },
    );
    globalThis.fetch = patchedFetch;

    try {
      await fetchFn('https://example.com', { method: 'GET' });
      expect(initialFetch).not.toHaveBeenCalled();
      expect(patchedFetch).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
