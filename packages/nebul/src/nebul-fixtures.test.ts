import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { createNebul } from './nebul-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const chatCompletion = JSON.parse(
  readFileSync('src/__fixtures__/nebul-chat-1.json', 'utf8'),
);
const embeddingResponse = JSON.parse(
  readFileSync('src/__fixtures__/nebul-embedding-1.json', 'utf8'),
);

const server = createTestServer({
  'https://api.inference.nebul.io/v1/chat/completions': {},
  'https://api.inference.nebul.io/v1/embeddings': {},
});

describe('live response fixtures', () => {
  it('should parse a real chat completion response', async () => {
    server.urls['https://api.inference.nebul.io/v1/chat/completions'].response =
      {
        type: 'json-value',
        body: chatCompletion,
      };

    const provider = createNebul({ apiKey: 'test-api-key' });
    const result = await provider.chat('zai-org/GLM-5.3-Flash').doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Say hello in one word.' }],
        },
      ],
    });

    expect(result.content).toContainEqual({ type: 'text', text: 'Hello!' });
    expect(result.finishReason.unified).toBe('stop');
    expect(result.usage.inputTokens.total).toBe(18);
    expect(result.usage.outputTokens.total).toBe(33);
  });

  it('should parse a real embedding response', async () => {
    server.urls['https://api.inference.nebul.io/v1/embeddings'].response = {
      type: 'json-value',
      body: embeddingResponse,
    };

    const provider = createNebul({ apiKey: 'test-api-key' });
    const { embeddings, usage } = await provider
      .embeddingModel('sentence-transformers/all-MiniLM-L6-v2')
      .doEmbed({ values: ['sunny day at the beach'] });

    expect(embeddings).toHaveLength(1);
    expect(embeddings[0]).toHaveLength(384);
    expect(usage).toBeDefined();
  });
});
