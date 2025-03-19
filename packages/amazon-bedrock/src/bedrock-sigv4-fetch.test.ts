import { createSigV4FetchFunction } from './bedrock-sigv4-fetch';
import { vi, describe, it, expect, afterEach } from 'vitest';

// Mock AwsV4Signer so that no real crypto calls are made.
vi.mock('aws4fetch', () => {
  class MockAwsV4Signer {
    options: any;
    constructor(options: any) {
      this.options = options;
    }
    async sign() {
      // Return a fake Headers instance with predetermined signing headers.
      const headers = new Headers();
      headers.set('x-amz-date', '20240315T000000Z');
      headers.set('authorization', 'AWS4-HMAC-SHA256 Credential=test');
      if (this.options.sessionToken) {
        headers.set('x-amz-security-token', this.options.sessionToken);
      }
      return { headers };
    }
  }
  return { AwsV4Signer: MockAwsV4Signer };
});

const createFetchFunction = (dummyFetch: any) =>
  createSigV4FetchFunction(
    () => ({
      region: 'us-west-2',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret',
    }),
    dummyFetch,
  );

describe('createSigV4FetchFunction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should bypass signing for non-POST requests', async () => {
    const dummyResponse = new Response('OK', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);
    const fetchFn = createFetchFunction(dummyFetch);

    const response = await fetchFn('http://example.com', { method: 'GET' });
    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'GET',
    });
    expect(response).toBe(dummyResponse);
  });

  it('should bypass signing if POST request has no body', async () => {
    const dummyResponse = new Response('OK', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);
    const fetchFn = createFetchFunction(dummyFetch);

    const response = await fetchFn('http://example.com', { method: 'POST' });
    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', {
      method: 'POST',
    });
    expect(response).toBe(dummyResponse);
  });

  it('should handle a POST request with a string body and merge signed headers', async () => {
    const dummyResponse = new Response('Signed', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);

    // Provide settings (including a sessionToken) so that the signer includes that header.\
    const fetchFn = createSigV4FetchFunction(
      () => ({
        region: 'us-west-2',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-session-token',
      }),
      dummyFetch,
    );

    const inputUrl = 'http://example.com';
    const init: RequestInit = {
      method: 'POST',
      body: '{"test": "data"}',
      headers: {
        'Content-Type': 'application/json',
        'Custom-Header': 'value',
      },
    };

    await fetchFn(inputUrl, init);
    expect(dummyFetch).toHaveBeenCalled();
    const calledInit = dummyFetch.mock.calls[0][1] as RequestInit;
    // `combinedHeaders` should merge the original headers with the signing
    // headers added by the AwsV4Signer mock.
    const headers = calledInit.headers as Record<string, string>;
    expect(headers['content-type']).toEqual('application/json');
    expect(headers['custom-header']).toEqual('value');
    expect(headers['empty-header']).toBeUndefined();
    expect(headers['x-amz-date']).toEqual('20240315T000000Z');
    expect(headers['authorization']).toEqual(
      'AWS4-HMAC-SHA256 Credential=test',
    );
    expect(headers['x-amz-security-token']).toEqual('test-session-token');
    // Body is left unmodified for a string body.
    expect(calledInit.body).toEqual('{"test": "data"}');
  });

  it('should handle non-string body by stringifying it', async () => {
    const dummyResponse = new Response('Signed', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);
    const fetchFn = createFetchFunction(dummyFetch);

    const inputUrl = 'http://example.com';
    const jsonBody = { field: 'value' };

    await fetchFn(inputUrl, {
      method: 'POST',
      body: jsonBody as unknown as BodyInit,
      headers: {},
    });
    expect(dummyFetch).toHaveBeenCalled();
    const calledInit = dummyFetch.mock.calls[0][1] as RequestInit;
    // The body should be stringified.
    expect(calledInit.body).toEqual(JSON.stringify(jsonBody));
  });

  it('should handle Uint8Array body', async () => {
    const dummyResponse = new Response('Signed', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);
    const fetchFn = createFetchFunction(dummyFetch);

    const inputUrl = 'http://example.com';
    const uint8Body = new TextEncoder().encode('binaryTest');

    await fetchFn(inputUrl, {
      method: 'POST',
      body: uint8Body,
      headers: {},
    });
    expect(dummyFetch).toHaveBeenCalled();
    const calledInit = dummyFetch.mock.calls[0][1] as RequestInit;
    // The Uint8Array body should have been decoded to a string.
    expect(calledInit.body).toEqual('binaryTest');
  });

  it('should handle ArrayBuffer body', async () => {
    const dummyResponse = new Response('Signed', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);
    const fetchFn = createFetchFunction(dummyFetch);

    const inputUrl = 'http://example.com';
    const text = 'bufferTest';
    const buffer = new TextEncoder().encode(text).buffer;

    await fetchFn(inputUrl, {
      method: 'POST',
      body: buffer,
      headers: {},
    });
    expect(dummyFetch).toHaveBeenCalled();
    const calledInit = dummyFetch.mock.calls[0][1] as RequestInit;
    expect(calledInit.body).toEqual(text);
  });

  it('should extract headers from a Headers instance', async () => {
    const dummyResponse = new Response('Signed', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);
    const fetchFn = createFetchFunction(dummyFetch);

    const h = new Headers();
    h.set('A', 'value-a');
    h.set('B', 'value-b');

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: h,
    });
    expect(dummyFetch).toHaveBeenCalled();
    const calledInit = dummyFetch.mock.calls[0][1] as RequestInit;
    const headers = calledInit.headers as Record<string, string>;
    expect(headers['a'] || headers['A']).toEqual('value-a');
    expect(headers['b'] || headers['B']).toEqual('value-b');
  });

  it('should handle headers provided as an array', async () => {
    const dummyResponse = new Response('Signed', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);
    const fetchFn = createFetchFunction(dummyFetch);

    const headersArray: [string, string][] = [
      ['Array-Header', 'array-value'],
      ['Another-Header', 'another-value'],
    ];

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test": "data"}',
      headers: headersArray,
    });
    expect(dummyFetch).toHaveBeenCalled();
    const calledInit = dummyFetch.mock.calls[0][1] as RequestInit;
    const headers = calledInit.headers as Record<string, string>;
    expect(headers['array-header'] || headers['Array-Header']).toEqual(
      'array-value',
    );
    expect(headers['another-header'] || headers['Another-Header']).toEqual(
      'another-value',
    );
    // Also check that the signing headers are included.
    expect(headers['x-amz-date']).toEqual('20240315T000000Z');
    expect(headers['authorization']).toEqual(
      'AWS4-HMAC-SHA256 Credential=test',
    );
  });

  it('should call original fetch if init is undefined', async () => {
    const dummyResponse = new Response('OK', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);
    const fetchFn = createFetchFunction(dummyFetch);

    const response = await fetchFn('http://example.com');
    expect(dummyFetch).toHaveBeenCalledWith('http://example.com', undefined);
    expect(response).toBe(dummyResponse);
  });

  it('should correctly handle async credential providers', async () => {
    const dummyResponse = new Response('Signed', { status: 200 });
    const dummyFetch = vi.fn().mockResolvedValue(dummyResponse);

    // Create a function that returns a Promise of credentials
    const asyncCredentialsProvider = () =>
      Promise.resolve({
        region: 'us-east-1',
        accessKeyId: 'async-access-key',
        secretAccessKey: 'async-secret-key',
        sessionToken: 'async-session-token',
      });

    const fetchFn = createSigV4FetchFunction(
      asyncCredentialsProvider,
      dummyFetch,
    );

    await fetchFn('http://example.com', {
      method: 'POST',
      body: '{"test": "async"}',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Verify the request was properly signed
    expect(dummyFetch).toHaveBeenCalled();
    const calledInit = dummyFetch.mock.calls[0][1] as RequestInit;
    const headers = calledInit.headers as Record<string, string>;

    // Check that the signing headers were added
    expect(headers['x-amz-date']).toEqual('20240315T000000Z');
    expect(headers['authorization']).toEqual(
      'AWS4-HMAC-SHA256 Credential=test',
    );
    expect(headers['x-amz-security-token']).toEqual('async-session-token');
    expect(headers['content-type']).toEqual('application/json');
  });

  it('should handle async credential providers that reject', async () => {
    const dummyFetch = vi.fn();
    const errorMessage = 'Failed to get credentials';

    // Create a function that returns a rejected Promise
    const failingCredentialsProvider = () =>
      Promise.reject(new Error(errorMessage));

    const fetchFn = createSigV4FetchFunction(
      failingCredentialsProvider,
      dummyFetch,
    );

    // The fetch call should propagate the rejection
    await expect(
      fetchFn('http://example.com', {
        method: 'POST',
        body: '{"test": "data"}',
      }),
    ).rejects.toThrow(errorMessage);

    // The underlying fetch should not be called
    expect(dummyFetch).not.toHaveBeenCalled();
  });
});
