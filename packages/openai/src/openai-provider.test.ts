import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAI } from './openai-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const createSuccessfulResponse = () =>
  new Response(
    JSON.stringify({
      object: 'list',
      data: [
        {
          object: 'embedding',
          index: 0,
          embedding: [0.1, 0.2],
        },
      ],
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 1, total_tokens: 1 },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );

const createFetchMock = () =>
  vi.fn().mockResolvedValue(createSuccessfulResponse());

describe('createOpenAI', () => {
  describe('baseURL configuration', () => {
    const originalBaseUrl = process.env.OPENAI_BASE_URL;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      process.env.OPENAI_BASE_URL = originalBaseUrl;
    });

    it('uses the default OpenAI base URL when not provided', async () => {
      delete process.env.OPENAI_BASE_URL;

      const fetchMock = createFetchMock();
      const provider = createOpenAI({
        apiKey: 'test-api-key',
        fetch: fetchMock,
      });

      await provider.embedding('text-embedding-3-small').doEmbed({
        values: ['hello'],
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0]!;
      expect(call[0]).toBe('https://api.openai.com/v1/embeddings');
    });

    it('uses OPENAI_BASE_URL when set', async () => {
      process.env.OPENAI_BASE_URL = 'https://proxy.openai.example/v1/';

      const fetchMock = createFetchMock();
      const provider = createOpenAI({
        apiKey: 'test-api-key',
        fetch: fetchMock,
      });

      await provider.embedding('text-embedding-3-small').doEmbed({
        values: ['hello'],
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0]!;
      expect(call[0]).toBe('https://proxy.openai.example/v1/embeddings');
    });

    it('prefers the baseURL option over OPENAI_BASE_URL', async () => {
      process.env.OPENAI_BASE_URL = 'https://env.openai.example/v1';

      const fetchMock = createFetchMock();
      const provider = createOpenAI({
        apiKey: 'test-api-key',
        baseURL: 'https://option.openai.example/v1/',
        fetch: fetchMock,
      });

      await provider.embedding('text-embedding-3-small').doEmbed({
        values: ['hello'],
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0]!;
      expect(call[0]).toBe('https://option.openai.example/v1/embeddings');
    });
  });
});
