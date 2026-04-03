import { resolve } from '@ai-sdk/provider-utils';
import { createVertexAnthropic as createVertexAnthropicOriginal } from './google-vertex-anthropic-provider';
import { createVertexAnthropic as createVertexAnthropicNode } from './google-vertex-anthropic-provider-node';
import { createAuthTokenGenerator } from '../google-vertex-auth-google-auth-library';
import { describe, beforeEach, expect, it, vi } from 'vitest';

// Mock the imported modules
vi.mock('../google-vertex-auth-google-auth-library', () => ({
  createAuthTokenGenerator: vi.fn(() =>
    vi.fn().mockResolvedValue('mock-auth-token'),
  ),
}));

vi.mock('./google-vertex-anthropic-provider', () => ({
  createVertexAnthropic: vi.fn().mockImplementation(options => ({
    ...options,
  })),
}));

describe('google-vertex-anthropic-provider-node', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('default headers function should return auth token', async () => {
    createVertexAnthropicNode({ project: 'test-project' });

    expect(createVertexAnthropicOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createVertexAnthropicOriginal).mock
      .calls[0][0];

    expect(typeof passedOptions?.headers).toBe('function');
    expect(await resolve(passedOptions?.headers)).toStrictEqual({
      Authorization: 'Bearer mock-auth-token',
    });
  });

  it('should use custom headers in addition to auth token when provided', async () => {
    createVertexAnthropicNode({
      project: 'test-project',
      headers: async () => ({
        'Custom-Header': 'custom-value',
      }),
    });

    expect(createVertexAnthropicOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createVertexAnthropicOriginal).mock
      .calls[0][0];

    expect(await resolve(passedOptions?.headers)).toEqual({
      Authorization: 'Bearer mock-auth-token',
      'Custom-Header': 'custom-value',
    });
  });

  it('passes googleAuthOptions to createAuthTokenGenerator', async () => {
    createVertexAnthropicNode({
      googleAuthOptions: {
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        keyFile: 'path/to/key.json',
      },
    });

    expect(createVertexAnthropicOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createVertexAnthropicOriginal).mock
      .calls[0][0];

    await resolve(passedOptions?.headers);

    expect(createAuthTokenGenerator).toHaveBeenCalledWith({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFile: 'path/to/key.json',
    });
  });

  it('creates the auth token generator once per provider instance', async () => {
    createVertexAnthropicNode({ project: 'test-project' });

    expect(createAuthTokenGenerator).toHaveBeenCalledTimes(1);

    const passedOptions = vi.mocked(createVertexAnthropicOriginal).mock
      .calls[0][0];

    await resolve(passedOptions?.headers);
    await resolve(passedOptions?.headers);

    expect(createAuthTokenGenerator).toHaveBeenCalledTimes(1);
  });
});
