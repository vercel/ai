import { resolve } from '@ai-sdk/provider-utils';
import { createVertex as createVertexEdge } from './google-vertex-provider-edge';
import { createVertex as createVertexOriginal } from '../google-vertex-provider';
import * as edgeAuth from './google-vertex-auth-edge';
import { describe, beforeEach, expect, it, vi } from 'vitest';

// Mock the imported modules
vi.mock('./google-vertex-auth-edge', () => ({
  generateAuthToken: vi.fn().mockResolvedValue('mock-auth-token'),
}));

vi.mock('../google-vertex-provider', () => ({
  createVertex: vi.fn().mockImplementation(options => ({
    ...options,
  })),
}));

describe('google-vertex-provider-edge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('default headers function should return auth token', async () => {
    createVertexEdge({ project: 'test-project' });

    const mockCreateVertex = vi.mocked(createVertexOriginal);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    expect(mockCreateVertex).toHaveBeenCalledTimes(1);
    expect(typeof passedOptions?.headers).toBe('function');

    expect(await resolve(passedOptions?.headers)).toStrictEqual({
      Authorization: 'Bearer mock-auth-token',
    });
  });

  it('should use custom headers in addition to auth token when provided', async () => {
    createVertexEdge({
      project: 'test-project',
      headers: async () => ({
        'Custom-Header': 'custom-value',
      }),
    });

    const mockCreateVertex = vi.mocked(createVertexOriginal);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    expect(mockCreateVertex).toHaveBeenCalledTimes(1);
    expect(typeof passedOptions?.headers).toBe('function');
    expect(await resolve(passedOptions?.headers)).toEqual({
      Authorization: 'Bearer mock-auth-token',
      'Custom-Header': 'custom-value',
    });
  });

  it('should use edge auth token generator', async () => {
    createVertexEdge({ project: 'test-project' });

    const mockCreateVertex = vi.mocked(createVertexOriginal);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    // Verify the headers function actually calls generateAuthToken by checking its result
    expect(passedOptions?.headers).toBeDefined();
    await resolve(passedOptions?.headers);
    expect(edgeAuth.generateAuthToken).toHaveBeenCalled();
  });

  it('passes googleCredentials to generateAuthToken', async () => {
    createVertexEdge({
      project: 'test-project',
      googleCredentials: {
        clientEmail: 'test@example.com',
        privateKey: 'test-key',
      },
    });

    const mockCreateVertex = vi.mocked(createVertexOriginal);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    await resolve(passedOptions?.headers); // call the headers function

    expect(edgeAuth.generateAuthToken).toHaveBeenCalledWith({
      clientEmail: 'test@example.com',
      privateKey: 'test-key',
    });
  });

  describe('Express Mode', () => {
    it('should use API key header when apiKey is provided', async () => {
      createVertexEdge({
        project: 'test-project',
        apiKey: 'test-api-key',
      });

      const mockCreateVertex = vi.mocked(createVertexOriginal);
      const passedOptions = mockCreateVertex.mock.calls[0][0];

      expect(mockCreateVertex).toHaveBeenCalledTimes(1);
      expect(await resolve(passedOptions?.headers)).toStrictEqual({
        'x-goog-api-key': 'test-api-key',
      });
    });

    it('should merge custom headers with API key in Express Mode', async () => {
      createVertexEdge({
        project: 'test-project',
        apiKey: 'test-api-key',
        headers: async () => ({
          'Custom-Header': 'custom-value',
        }),
      });

      const mockCreateVertex = vi.mocked(createVertexOriginal);
      const passedOptions = mockCreateVertex.mock.calls[0][0];

      expect(await resolve(passedOptions?.headers)).toEqual({
        'x-goog-api-key': 'test-api-key',
        'Custom-Header': 'custom-value',
      });
    });

    it('should prioritize API key over OAuth when both apiKey and googleCredentials are provided', async () => {
      createVertexEdge({
        project: 'test-project',
        apiKey: 'test-api-key',
        googleCredentials: {
          clientEmail: 'test@example.com',
          privateKey: 'test-key',
        },
      });

      const mockCreateVertex = vi.mocked(createVertexOriginal);
      const passedOptions = mockCreateVertex.mock.calls[0][0];
      const headers = await resolve(passedOptions?.headers);

      expect(headers).toHaveProperty('x-goog-api-key', 'test-api-key');
      expect(headers).not.toHaveProperty('Authorization');
      expect(edgeAuth.generateAuthToken).not.toHaveBeenCalled();
    });

    it('should not call generateAuthToken when API key is present', async () => {
      createVertexEdge({
        project: 'test-project',
        apiKey: 'test-api-key',
      });

      const mockCreateVertex = vi.mocked(createVertexOriginal);
      const passedOptions = mockCreateVertex.mock.calls[0][0];
      await resolve(passedOptions?.headers);

      expect(edgeAuth.generateAuthToken).not.toHaveBeenCalled();
    });

    it('should use OAuth mode when apiKey is not provided', async () => {
      createVertexEdge({
        project: 'test-project',
      });

      const mockCreateVertex = vi.mocked(createVertexOriginal);
      const passedOptions = mockCreateVertex.mock.calls[0][0];
      const headers = await resolve(passedOptions?.headers);

      expect(headers).toHaveProperty('Authorization', 'Bearer mock-auth-token');
      expect(headers).not.toHaveProperty('x-goog-api-key');
      expect(edgeAuth.generateAuthToken).toHaveBeenCalled();
    });
  });
});
