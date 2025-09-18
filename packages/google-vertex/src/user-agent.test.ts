import { describe, it, expect, vi } from 'vitest';
import { createVertex } from './google-vertex-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

// Mock the Google AI model that Google Vertex uses
vi.mock('@ai-sdk/google/internal', () => ({
  GoogleGenerativeAILanguageModel: vi.fn().mockImplementation((modelId, config) => ({
    doGenerate: vi.fn().mockImplementation(async () => {
      if (config?.fetch) {
        await config.fetch('https://test-url', { headers: await config.headers() });
      }
      return {
        content: [{ type: 'text', text: 'response' }],
        finishReason: 'stop',
        usage: {},
        warnings: [],
      };
    }),
  })),
  googleTools: {
    googleSearch: vi.fn(),
    urlContext: vi.fn(),
    codeExecution: vi.fn(),
  },
}));

describe('user-agent', () => {
  it('should include google-vertex version in user-agent header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{
            content: {
              parts: [{ text: 'ok' }],
              role: 'model',
            },
            finishReason: 'STOP',
          }],
          promptFeedback: {},
        }),
      ),
    );

    const provider = createVertex({
      project: 'test-project',
      location: 'us-central1',
      fetch: mockFetch,
    });

    await provider.languageModel('gemini-1.5-pro').doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    expect(mockFetch).toHaveBeenCalled();

    const fetchCallArgs = mockFetch.mock.calls[0];
    const requestInit = fetchCallArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    expect(headers['user-agent']).toContain('ai-sdk/google-vertex/0.0.0-test');
  });
});
