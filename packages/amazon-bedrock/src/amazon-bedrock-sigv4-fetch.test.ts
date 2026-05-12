import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createApiKeyFetchFunction,
  createSigV4FetchFunction,
} from './amazon-bedrock-sigv4-fetch';

vi.mock('./version', () => ({
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

  it('signs requests with the bedrock service and bedrock user-agent', async () => {
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

    await fetchFn('https://bedrock-runtime.us-west-2.amazonaws.com/x', {
      method: 'POST',
      body: '{"hi":1}',
    });

    const signerInstance = signerSpy.mock.instances[0] as {
      options: { service: string };
    };
    expect(signerInstance.options.service).toBe('bedrock');

    const calledHeaders = dummyFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['user-agent']).toContain(
      'ai-sdk/amazon-bedrock/0.0.0-test',
    );
  });
});

describe('createApiKeyFetchFunction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds Authorization Bearer header and merges with existing headers', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createApiKeyFetchFunction('test-key', dummyFetch);

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test":"data"}',
      headers: { 'Content-Type': 'application/json' },
    });

    const calledHeaders = dummyFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['Authorization']).toBe('Bearer test-key');
    expect(calledHeaders['content-type']).toBe('application/json');
    expect(calledHeaders['user-agent']).toContain(
      'ai-sdk/amazon-bedrock/0.0.0-test',
    );
  });

  it('works with Headers instance', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createApiKeyFetchFunction('test-key', dummyFetch);

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('X-Custom', 'value');

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{}',
      headers,
    });

    const calledHeaders = dummyFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['Authorization']).toBe('Bearer test-key');
    expect(calledHeaders['content-type']).toBe('application/json');
    expect(calledHeaders['x-custom']).toBe('value');
  });

  it('overrides existing Authorization header', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createApiKeyFetchFunction('new-token', dummyFetch);

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer old-token' },
    });

    const calledHeaders = dummyFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['Authorization']).toBe('Bearer new-token');
  });

  it('works when init is undefined', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createApiKeyFetchFunction('test-key', dummyFetch);

    await fetchFn('http://example.com');

    const calledHeaders = dummyFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['Authorization']).toBe('Bearer test-key');
  });

  it('resolves default fetch lazily when no custom fetch provided', async () => {
    const originalFetch = globalThis.fetch;
    const initialFetch = vi.fn().mockResolvedValue(new Response('initial'));
    const patchedFetch = vi.fn().mockResolvedValue(new Response('patched'));

    globalThis.fetch = initialFetch;
    const fetchFn = createApiKeyFetchFunction('test-key');
    globalThis.fetch = patchedFetch;

    try {
      await fetchFn('http://example.com');
      expect(initialFetch).not.toHaveBeenCalled();
      expect(patchedFetch).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
