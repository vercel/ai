import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';
import * as providerUtils from '@ai-sdk/provider-utils';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    getRuntimeEnvironmentUserAgent: vi.fn(() => 'runtime/test-env'),
    withUserAgentSuffix: vi.fn((headers, ...suffixes) => {
      return { ...headers, 'user-agent': suffixes.join(' ') };
    }),
  };
});

describe('user-agent', () => {
  beforeEach(() => {
    // Reset mock before each test
    vi.mocked(providerUtils.withUserAgentSuffix).mockClear();
  });
  
  it('should include ai-sdk/google/<version> in user-agent header', async () => {
    // Create a provider with a mock fetch that never actually makes network calls
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: 'ok' }],
          role: 'model',
        },
        finishReason: 'STOP',
      }],
      promptFeedback: {},
    })));
    
    const provider = createGoogleGenerativeAI({ 
      apiKey: 'test-api-key',
      fetch: mockFetch
    });

    // Make a call to trigger header generation
    await provider.chat('gemini-1.5-pro').doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });
    
    // Verify withUserAgentSuffix was called with the correct suffix
    expect(providerUtils.withUserAgentSuffix).toHaveBeenCalled();
    const suffixArg = vi.mocked(providerUtils.withUserAgentSuffix).mock.calls[0][1];
    
    // Assert exact format
    expect(suffixArg).toBe('ai-sdk/google/0.0.0-test');
  });
});
