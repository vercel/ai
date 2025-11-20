/* eslint-disable turbo/no-undeclared-env-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createAnthropic } from './anthropic-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const createSuccessfulResponse = () =>
  new Response(
    JSON.stringify({
      type: 'message',
      id: 'msg_123',
      model: 'claude-3-haiku-20240307',
      content: [{ type: 'text', text: 'Hi' }],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );

const createFetchMock = () =>
  vi.fn().mockResolvedValue(createSuccessfulResponse());

describe('createAnthropic', () => {
  describe('baseURL configuration', () => {
    const originalBaseUrl = process.env.ANTHROPIC_BASE_URL;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      if (originalBaseUrl === undefined) {
        delete process.env.ANTHROPIC_BASE_URL;
      } else {
        process.env.ANTHROPIC_BASE_URL = originalBaseUrl;
      }
    });

    it('uses the default Anthropic base URL when not provided', async () => {
      delete process.env.ANTHROPIC_BASE_URL;

      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        apiKey: 'test-api-key',
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe('https://api.anthropic.com/v1/messages');
    });

    it('uses ANTHROPIC_BASE_URL when set', async () => {
      process.env.ANTHROPIC_BASE_URL = 'https://proxy.anthropic.example/v1/';

      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        apiKey: 'test-api-key',
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe('https://proxy.anthropic.example/v1/messages');
    });

    it('prefers the baseURL option over ANTHROPIC_BASE_URL', async () => {
      process.env.ANTHROPIC_BASE_URL = 'https://env.anthropic.example/v1';

      const fetchMock = createFetchMock();
      const provider = createAnthropic({
        apiKey: 'test-api-key',
        baseURL: 'https://option.anthropic.example/v1/',
        fetch: fetchMock,
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl] = fetchMock.mock.calls[0]!;
      expect(requestUrl).toBe('https://option.anthropic.example/v1/messages');
    });
  });
});

describe('anthropic provider - custom provider name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use custom provider name when specified', () => {
    const provider = createAnthropic({
      name: 'my-claude-proxy',
      apiKey: 'test-api-key',
    });

    const model = provider('claude-3-haiku-20240307');
    expect(model.provider).toBe('my-claude-proxy');
  });

  it('should default to anthropic.messages when name not specified', () => {
    const provider = createAnthropic({
      apiKey: 'test-api-key',
    });

    const model = provider('claude-3-haiku-20240307');
    expect(model.provider).toBe('anthropic.messages');
  });
});
