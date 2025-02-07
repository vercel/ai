import { createSigV4SigningFunction } from './bedrock-sigv4-signing-function';
import { resolve } from '@ai-sdk/provider-utils';
import { vi, describe, it, expect } from 'vitest';

describe('createSigV4SigningFunction', () => {
  const mockSettings = {
    region: 'us-west-2',
    accessKeyId: 'test-key-id',
    secretAccessKey: 'test-secret-key',
  };

  it('should preserve input headers in the signed output', async () => {
    const signingFn = createSigV4SigningFunction(mockSettings);
    const inputHeaders = {
      'Content-Type': 'application/json',
      'Custom-Header': 'test-value',
    };

    const signedHeaders = await resolve(
      signingFn({
        url: 'https://bedrock.us-west-2.amazonaws.com/model/anthropic.claude-3-sonnet-20240229-v1:0/invoke',
        headers: inputHeaders,
        body: { test: 'data' },
      }),
    );

    // Verify input headers are preserved
    Object.entries(inputHeaders).forEach(([key, value]) => {
      expect(signedHeaders[key.toLowerCase()]).toBe(value);
    });

    // Verify AWS signature headers are added
    expect(signedHeaders['x-amz-date']).toBeDefined();
    expect(signedHeaders['authorization']).toBeDefined();
  });

  it('should include session token header when provided', async () => {
    const settingsWithToken = {
      ...mockSettings,
      sessionToken: 'test-session-token',
    };

    const signingFn = createSigV4SigningFunction(settingsWithToken);
    const signedHeaders = await resolve(
      signingFn({
        url: 'https://bedrock.us-west-2.amazonaws.com/model/anthropic.claude-3-sonnet-20240229-v1:0/invoke',
        headers: {},
        body: { test: 'data' },
      }),
    );

    expect(signedHeaders['x-amz-security-token']).toBe('test-session-token');
  });

  it('should load settings from environment variables when not provided', async () => {
    // Mock environment variables
    vi.stubEnv('AWS_REGION', 'us-east-1');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'env-key-id');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'env-secret-key');

    const signingFn = createSigV4SigningFunction();
    const signedHeaders = await resolve(
      signingFn({
        url: 'https://bedrock.us-east-1.amazonaws.com/model/anthropic.claude-3-sonnet-20240229-v1:0/invoke',
        headers: {},
        body: { test: 'data' },
      }),
    );

    expect(signedHeaders['authorization']).toContain('AWS4-HMAC-SHA256');
    expect(signedHeaders['x-amz-date']).toBeDefined();

    // Clean up environment
    vi.unstubAllEnvs();
  });

  it('should filter out undefined header values', async () => {
    const signingFn = createSigV4SigningFunction(mockSettings);
    const inputHeaders = {
      'Content-Type': 'application/json',
      'Empty-Header': undefined,
    };

    const signedHeaders = await resolve(
      signingFn({
        url: 'https://bedrock.us-west-2.amazonaws.com/model/anthropic.claude-3-sonnet-20240229-v1:0/invoke',
        headers: inputHeaders,
        body: { test: 'data' },
      }),
    );

    expect(signedHeaders['content-type']).toBe('application/json');
    expect(signedHeaders['empty-header']).toBeUndefined();
  });
});
