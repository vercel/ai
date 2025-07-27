import { resolve } from '@ai-sdk/provider-utils';
import * as edgeAuth from '../../edge/google-vertex-auth-edge';
import { createVertexAnthropic as createVertexAnthropicOriginal } from '../google-vertex-anthropic-provider';
import { createVertexAnthropic as createVertexAnthropicEdge } from './google-vertex-anthropic-provider-edge';

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

  it('default headers function should return auth token', async () => {
    createVertexAnthropicEdge({ project: 'test-project' });

    const mockCreateVertex = vi.mocked(createVertexAnthropicOriginal);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    expect(mockCreateVertex).toHaveBeenCalledTimes(1);
    expect(typeof passedOptions?.headers).toBe('function');

    expect(await resolve(passedOptions?.headers)).toStrictEqual({
      Authorization: 'Bearer mock-auth-token',
    });
  });

  it('should use custom headers in addition to auth token when provided', async () => {
    createVertexAnthropicEdge({
      project: 'test-project',
      headers: async () => ({
        'Custom-Header': 'custom-value',
      }),
    });

    const mockCreateVertex = vi.mocked(createVertexAnthropicOriginal);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    expect(mockCreateVertex).toHaveBeenCalledTimes(1);
    expect(typeof passedOptions?.headers).toBe('function');
    expect(await resolve(passedOptions?.headers)).toEqual({
      Authorization: 'Bearer mock-auth-token',
      'Custom-Header': 'custom-value',
    });
  });

  it('should use edge auth token generator', async () => {
    createVertexAnthropicEdge({ project: 'test-project' });

    const mockCreateVertex = vi.mocked(createVertexAnthropicOriginal);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    // Verify the headers function actually calls generateAuthToken by checking its result
    expect(passedOptions?.headers).toBeDefined();
    await resolve(passedOptions?.headers);
    expect(edgeAuth.generateAuthToken).toHaveBeenCalled();
  });

  it('passes googleCredentials to generateAuthToken', async () => {
    createVertexAnthropicEdge({
      project: 'test-project',
      googleCredentials: {
        clientEmail: 'test@example.com',
        privateKey: 'test-key',
      },
    });

    const mockCreateVertex = vi.mocked(createVertexAnthropicOriginal);
    const passedOptions = mockCreateVertex.mock.calls[0][0];

    await resolve(passedOptions?.headers); // call the headers function

    expect(edgeAuth.generateAuthToken).toHaveBeenCalledWith({
      clientEmail: 'test@example.com',
      privateKey: 'test-key',
    });
  });
});
