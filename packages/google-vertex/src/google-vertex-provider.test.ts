import { resolve } from '@ai-sdk/provider-utils';
import { createAuthHeadersGenerator } from './google-vertex-auth-google-auth-library';
import { createGoogleVertex as createGoogleVertexOriginal } from './google-vertex-provider-base';
import { createGoogleVertex as createVertexNode } from './google-vertex-provider';
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';

// Mock the imported modules
vi.mock('./google-vertex-auth-google-auth-library', () => ({
  createAuthHeadersGenerator: vi.fn(() =>
    vi.fn().mockResolvedValue({
      authorization: 'Bearer mock-auth-token',
      'x-goog-user-project': 'auth-quota-project',
    }),
  ),
}));

vi.mock('./google-vertex-provider-base', () => ({
  createGoogleVertex: vi.fn().mockImplementation(options => ({
    ...options,
  })),
}));

describe('google-vertex-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GOOGLE_VERTEX_API_KEY;
  });

  afterEach(() => {
    delete process.env.GOOGLE_VERTEX_API_KEY;
  });

  it('default headers function should return auth client request headers', async () => {
    createVertexNode({ project: 'test-project' });

    expect(createGoogleVertexOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createGoogleVertexOriginal).mock
      .calls[0][0];

    expect(typeof passedOptions?.headers).toBe('function');
    expect(await resolve(passedOptions?.headers)).toStrictEqual({
      authorization: 'Bearer mock-auth-token',
      'x-goog-user-project': 'auth-quota-project',
    });
  });

  it('should use custom headers in addition to auth headers when provided', async () => {
    createVertexNode({
      project: 'test-project',
      headers: async () => ({
        'Custom-Header': 'custom-value',
      }),
    });

    expect(createGoogleVertexOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createGoogleVertexOriginal).mock
      .calls[0][0];

    expect(await resolve(passedOptions?.headers)).toEqual({
      authorization: 'Bearer mock-auth-token',
      'custom-header': 'custom-value',
      'x-goog-user-project': 'auth-quota-project',
    });
  });

  it('should let custom headers override auth headers case-insensitively', async () => {
    createVertexNode({
      project: 'test-project',
      headers: {
        Authorization: 'Bearer custom-token',
        'X-Goog-User-Project': 'custom-quota-project',
      },
    });

    const passedOptions = vi.mocked(createGoogleVertexOriginal).mock
      .calls[0][0];

    expect(await resolve(passedOptions?.headers)).toEqual({
      authorization: 'Bearer custom-token',
      'x-goog-user-project': 'custom-quota-project',
    });
  });

  it('passes googleAuthOptions to createAuthHeadersGenerator', async () => {
    createVertexNode({
      googleAuthOptions: {
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        keyFile: 'path/to/key.json',
      },
    });

    expect(createGoogleVertexOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createGoogleVertexOriginal).mock
      .calls[0][0];

    await resolve(passedOptions?.headers); // call the headers function

    expect(createAuthHeadersGenerator).toHaveBeenCalledWith({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFile: 'path/to/key.json',
    });
  });

  it('passes project to createAuthHeadersGenerator as projectId', async () => {
    createVertexNode({
      project: 'test-project',
    });

    expect(createGoogleVertexOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createGoogleVertexOriginal).mock
      .calls[0][0];

    await resolve(passedOptions?.headers); // call the headers function

    expect(createAuthHeadersGenerator).toHaveBeenCalledWith({
      projectId: 'test-project',
    });
  });

  it('does not override explicit googleAuthOptions projectId', async () => {
    createVertexNode({
      project: 'provider-project',
      googleAuthOptions: {
        projectId: 'auth-project',
        keyFile: 'path/to/key.json',
      },
    });

    expect(createGoogleVertexOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createGoogleVertexOriginal).mock
      .calls[0][0];

    await resolve(passedOptions?.headers); // call the headers function

    expect(createAuthHeadersGenerator).toHaveBeenCalledWith({
      projectId: 'auth-project',
      keyFile: 'path/to/key.json',
    });
  });

  it('should pass options through to base provider when apiKey is provided', async () => {
    createVertexNode({
      apiKey: 'test-api-key',
    });

    expect(createGoogleVertexOriginal).toHaveBeenCalledTimes(1);
    const passedOptions = vi.mocked(createGoogleVertexOriginal).mock
      .calls[0][0];

    expect(passedOptions?.apiKey).toBe('test-api-key');
    expect(passedOptions?.headers).toBeUndefined();
    expect(createAuthHeadersGenerator).not.toHaveBeenCalled();
  });

  it('creates the auth headers generator once per provider instance', async () => {
    createVertexNode({ project: 'test-project' });

    expect(createAuthHeadersGenerator).toHaveBeenCalledTimes(1);

    const passedOptions = vi.mocked(createGoogleVertexOriginal).mock
      .calls[0][0];

    await resolve(passedOptions?.headers);
    await resolve(passedOptions?.headers);

    expect(createAuthHeadersGenerator).toHaveBeenCalledTimes(1);
  });
});
