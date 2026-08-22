import { describe, expect, it, vi } from 'vitest';
import { createDeepSeek } from './deepseek-provider';
import type { LanguageModelV4 } from '@ai-sdk/provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const createFetchMock = () =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

/**
 * Sends a request with `model` and returns the URL it was sent to. The mocked
 * response body is not a real DeepSeek response, so whether the call succeeds
 * is irrelevant here - only the endpoint the model talks to matters.
 */
const getRequestUrl = async (
  model: LanguageModelV4,
  fetchMock: ReturnType<typeof createFetchMock>,
) => {
  try {
    await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    });
  } catch {
    // ignored, see above
  }

  return fetchMock.mock.calls[0]?.[0];
};

describe('createDeepSeek', () => {
  describe('language model factories', () => {
    it('uses the responses API for models created with `responses`', async () => {
      const fetchMock = createFetchMock();
      const provider = createDeepSeek({
        apiKey: 'test-api-key',
        fetch: fetchMock,
      });

      expect(
        await getRequestUrl(provider.responses('deepseek-flash'), fetchMock),
      ).toBe('https://api.deepseek.com/responses');
      expect(provider.responses('deepseek-flash').provider).toBe(
        'deepseek.responses',
      );
    });
  });
});
