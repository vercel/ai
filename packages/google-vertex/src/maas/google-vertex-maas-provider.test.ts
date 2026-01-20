import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVertexMaas } from './google-vertex-maas-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// Mock the imported modules
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadSetting: vi.fn().mockImplementation(({ settingValue }) => {
    if (settingValue === undefined) {
      throw new Error('Setting is missing');
    }
    return settingValue;
  }),
  loadOptionalSetting: vi
    .fn()
    .mockImplementation(({ settingValue }) => settingValue),
  withoutTrailingSlash: vi.fn().mockImplementation(url => {
    if (!url) return '';
    return url?.endsWith('/') ? url.slice(0, -1) : url;
  }),
}));

describe('google-vertex-maas-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a provider with correct base URL for global location', () => {
    createVertexMaas({
      project: 'test-project',
      location: 'global',
    });

    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'vertex.maas',
        baseURL:
          'https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/endpoints/openapi',
      }),
    );
  });

  it('should create a provider with correct base URL for regional location', () => {
    createVertexMaas({
      project: 'test-project',
      location: 'us-central1',
    });

    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'vertex.maas',
        baseURL:
          'https://aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/endpoints/openapi',
      }),
    );
  });

  it('should default to global location when not specified', () => {
    createVertexMaas({
      project: 'test-project',
    });

    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'vertex.maas',
        baseURL:
          'https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/endpoints/openapi',
      }),
    );
  });

  it('should use custom baseURL when provided', () => {
    const customBaseURL = 'https://custom-endpoint.example.com';
    createVertexMaas({
      project: 'test-project',
      baseURL: customBaseURL,
    });

    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'vertex.maas',
        baseURL: customBaseURL,
      }),
    );
  });

  it('should not pass headers to openai-compatible provider', () => {
    const customHeaders = { 'X-Custom': 'header-value' };
    createVertexMaas({
      project: 'test-project',
      headers: customHeaders,
    });

    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'vertex.maas',
        baseURL: expect.any(String),
        fetch: undefined,
      }),
    );
    expect(createOpenAICompatible).not.toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.anything(),
      }),
    );
  });

  it('should pass custom fetch to openai-compatible provider', () => {
    const customFetch = vi.fn();
    createVertexMaas({
      project: 'test-project',
      fetch: customFetch,
    });

    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: customFetch,
      }),
    );
  });

  it('should construct correct URL with trailing slash removed from baseURL', () => {
    createVertexMaas({
      project: 'test-project',
      baseURL: 'https://custom-endpoint.example.com/',
    });

    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://custom-endpoint.example.com',
      }),
    );
  });

  it('should construct correct URL when baseURL is empty string', () => {
    createVertexMaas({
      project: 'test-project',
      location: 'us-central1',
      baseURL: '',
    });

    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL:
          'https://aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/endpoints/openapi',
      }),
    );
  });

  it('should return a provider from createOpenAICompatible', () => {
    const mockProvider = vi.fn();
    vi.mocked(createOpenAICompatible).mockReturnValue(mockProvider as any);

    const result = createVertexMaas({
      project: 'test-project',
    });

    expect(result).toBe(mockProvider);
  });
});
