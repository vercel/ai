import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVertexAnthropic } from './google-vertex-anthropic-provider-edge';
import * as baseProvider from '../google-vertex-anthropic-provider';
import * as edgeAuth from '../../edge/google-vertex-auth-edge';

// Mock the imported modules
vi.mock('../../edge/google-vertex-auth-edge', () => ({
  generateAuthToken: vi.fn().mockResolvedValue('mock-auth-token'),
}));

vi.mock('../google-vertex-anthropic-provider', () => ({
  createVertexAnthropic: vi.fn().mockImplementation(options => ({
    ...options,
  })),
}));

describe('google-vertex-anthropic-provider-edge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set up default auth token header when no headers provided', () => {
    createVertexAnthropic({ project: 'test-project' });

    const mockCreateProvider = vi.mocked(baseProvider.createVertexAnthropic);
    const passedOptions = mockCreateProvider.mock.calls[0][0];

    expect(mockCreateProvider).toHaveBeenCalledTimes(1);
    expect(typeof passedOptions?.headers).toBe('function');
  });

  it('default headers function should return auth token and anthropic version', async () => {
    createVertexAnthropic({ project: 'test-project' });

    const mockCreateProvider = vi.mocked(baseProvider.createVertexAnthropic);
    const passedOptions = mockCreateProvider.mock.calls[0][0];
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

    createVertexAnthropic({
      project: 'test-project',
      headers: customHeaders,
    });

    const mockCreateProvider = vi.mocked(baseProvider.createVertexAnthropic);
    const passedOptions = mockCreateProvider.mock.calls[0][0];

    expect(mockCreateProvider).toHaveBeenCalledTimes(1);
    expect(passedOptions?.headers).toBe(customHeaders);
  });

  it('should use edge auth token generator', () => {
    createVertexAnthropic({ project: 'test-project' });

    const mockCreateProvider = vi.mocked(baseProvider.createVertexAnthropic);
    const passedOptions = mockCreateProvider.mock.calls[0][0];

    expect(passedOptions?.headers).toBeDefined();
    expect(passedOptions?.headers?.toString()).toContain('generateAuthToken');
  });

  it('should call generateAuthToken with provided googleCredentials', async () => {
    const mockCredentials = {
      clientEmail: 'test@example.com',
      privateKey: 'test-key',
    };

    createVertexAnthropic({
      project: 'test-project',
      googleCredentials: mockCredentials,
    });

    const mockCreateProvider = vi.mocked(baseProvider.createVertexAnthropic);
    const passedOptions = mockCreateProvider.mock.calls[0][0];
    const headersFunction = passedOptions?.headers as () => Promise<
      Record<string, string>
    >;

    await headersFunction();

    expect(edgeAuth.generateAuthToken).toHaveBeenCalledWith(mockCredentials);
  });
});
