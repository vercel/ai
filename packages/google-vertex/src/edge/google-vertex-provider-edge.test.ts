import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVertex } from './google-vertex-provider-edge';
import * as baseProvider from '../google-vertex-provider';
import * as edgeAuth from './google-vertex-auth-edge';

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

  it('should set up default auth token header when no headers provided', () => {
    createVertex({ project: 'test-project' });

    const mockCreateVertex = vi.mocked(baseProvider.createVertex);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    expect(mockCreateVertex).toHaveBeenCalledTimes(1);
    expect(typeof passedOptions?.headers).toBe('function');
  });

  it('default headers function should return auth token', async () => {
    createVertex({ project: 'test-project' });

    const mockCreateVertex = vi.mocked(baseProvider.createVertex);
    const passedOptions = mockCreateVertex.mock.calls[0][0];
    const headersFunction = passedOptions?.headers as () => Promise<
      Record<string, string>
    >;
    const headers = await headersFunction();

    expect(headers).toEqual({
      Authorization: 'Bearer mock-auth-token',
    });
  });

  it('should pass through custom headers when provided', () => {
    const customHeaders = async () => ({
      'Custom-Header': 'custom-value',
    });

    createVertex({
      project: 'test-project',
      headers: customHeaders,
    });

    const mockCreateVertex = vi.mocked(baseProvider.createVertex);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    expect(mockCreateVertex).toHaveBeenCalledTimes(1);
    expect(passedOptions?.headers).toBe(customHeaders);
  });

  it('should use edge auth token generator', () => {
    createVertex({ project: 'test-project' });

    const mockCreateVertex = vi.mocked(baseProvider.createVertex);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    // Verify the headers function is using the edge auth generator
    expect(passedOptions?.headers).toBeDefined();
    expect(passedOptions?.headers?.toString()).toContain('generateAuthToken');
  });

  it('should call generateAuthToken with provided googleCredentials', async () => {
    const mockCredentials = {
      clientEmail: 'test@example.com',
      privateKey: 'test-key',
    };

    createVertex({
      project: 'test-project',
      googleCredentials: mockCredentials,
    });

    const mockCreateVertex = vi.mocked(baseProvider.createVertex);
    const passedOptions = mockCreateVertex.mock.calls[0][0];
    const headersFunction = passedOptions?.headers as () => Promise<
      Record<string, string>
    >;

    // Call the headers function to trigger generateAuthToken
    await headersFunction();

    expect(edgeAuth.generateAuthToken).toHaveBeenCalledWith(mockCredentials);
  });
});
