import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createNebul } from './nebul-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const server = createTestServer({
  'https://api.inference.nebul.io/model/info': {},
});

function prepareJsonResponse(body: Record<string, any>) {
  server.urls['https://api.inference.nebul.io/model/info'].response = {
    type: 'json-value',
    body,
  };
}

const sampleModelInfoEntry = {
  model_name: 'zai-org/GLM-5.3-Flash',
  model_info: {
    id: '01a04993-0be2-7cae-8cd1-3c314c22194c',
    key: 'zai-org/GLM-5.3-Flash',
    model_type: 'llm',
    mode: 'chat',
    description:
      'MoE reasoning model with 1M-token context for long-horizon agentic tasks.',
    huggingface_id: 'zai-org/GLM-5.3-Flash',
    max_input_tokens: 1048572,
    is_preview: false,
    input_cost_per_1m_tokens: 0.35,
    output_cost_per_1m_tokens: 2.13,
    cache_read_input_cost_per_1m_tokens: 0.04,
    parameters_count: '753.3B',
    precision: 'FP8',
    reasoning_efforts: [],
    supports_audio_input: false,
    supports_audio_output: false,
    supports_function_calling: true,
    supports_multilingual: true,
    supports_reasoning: false,
    supports_response_schema: false,
    supports_vision: true,
  },
};

describe('getAvailableModels', () => {
  it('should fetch and map the model catalog', async () => {
    prepareJsonResponse({
      data: [
        sampleModelInfoEntry,
        {
          model_name: 'Tongyi-MAI/Z-Image-Turbo',
          model_info: {
            key: 'Tongyi-MAI/Z-Image-Turbo',
            model_type: 'image',
            mode: 'image',
            max_input_tokens: null,
            supports_function_calling: null,
          },
        },
        {
          model_name: 'BAAI/bge-reranker-v2-m3',
          model_info: {
            key: null,
            model_type: 'reranker',
            mode: 'rerank',
            is_preview: true,
            superseded_by_model_name: 'BAAI/bge-reranker-v2-m3-v2',
            reasoning_efforts: ['low', 'high'],
            parameters_count: 595,
          },
        },
      ],
    });

    const provider = createNebul({ apiKey: 'test-api-key' });
    const models = await provider.getAvailableModels();

    expect(models).toEqual([
      {
        id: 'zai-org/GLM-5.3-Flash',
        modelType: 'llm',
        mode: 'chat',
        description:
          'MoE reasoning model with 1M-token context for long-horizon agentic tasks.',
        maxInputTokens: 1048572,
        isPreview: false,
        supportsFunctionCalling: true,
        supportsResponseSchema: false,
        supportsReasoning: false,
        supportsVision: true,
        supportsAudioInput: false,
        supportsAudioOutput: false,
        reasoningEfforts: [],
        pricing: {
          inputPer1MTokens: 0.35,
          outputPer1MTokens: 2.13,
          cacheReadPer1MTokens: 0.04,
        },
        parametersCount: '753.3B',
        precision: 'FP8',
      },
      {
        id: 'Tongyi-MAI/Z-Image-Turbo',
        modelType: 'image',
        mode: 'image',
      },
      {
        id: 'BAAI/bge-reranker-v2-m3',
        modelType: 'reranker',
        mode: 'rerank',
        isPreview: true,
        supersededBy: 'BAAI/bge-reranker-v2-m3-v2',
        reasoningEfforts: ['low', 'high'],
        parametersCount: '595',
      },
    ]);
  });

  it('should send authorization headers when an api key is available', async () => {
    prepareJsonResponse({ data: [] });

    const provider = createNebul({ apiKey: 'test-api-key' });
    await provider.getAvailableModels();

    expect(server.calls[0].requestHeaders.authorization).toBe(
      'Bearer test-api-key',
    );
  });

  it('should not fail when no api key is available', async () => {
    prepareJsonResponse({ data: [] });

    vi.stubEnv('NEBUL_API_KEY', '');
    const provider = createNebul();

    await expect(provider.getAvailableModels()).resolves.toEqual([]);

    expect(server.calls[0].requestHeaders.authorization).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it('should not fetch again while the cached result is fresh', async () => {
    prepareJsonResponse({ data: [] });

    let currentTime = 1_000_000;
    const provider = createNebul({
      _internal: { currentDate: () => new Date(currentTime) },
    });

    await provider.getAvailableModels();
    currentTime += 1000 * 60 * 4; // less than the 5 minute TTL
    await provider.getAvailableModels();
    await provider.getAvailableModels();

    expect(server.calls.length).toBe(1);
  });

  it('should fetch again after the cached result has expired', async () => {
    prepareJsonResponse({ data: [] });

    let currentTime = 1_000_000;
    const provider = createNebul({
      _internal: { currentDate: () => new Date(currentTime) },
    });

    await provider.getAvailableModels();
    currentTime += 1000 * 60 * 5 + 1; // more than the 5 minute TTL
    await provider.getAvailableModels();

    // the stale cache is returned immediately and the refresh happens in the
    // background
    await vi.waitFor(() => {
      expect(server.calls.length).toBe(2);
    });
  });

  it('should serve a single request for concurrent calls', async () => {
    prepareJsonResponse({ data: [] });

    const provider = createNebul();

    await Promise.all([
      provider.getAvailableModels(),
      provider.getAvailableModels(),
      provider.getAvailableModels(),
    ]);

    expect(server.calls.length).toBe(1);
  });

  it('should honor a custom metadataCacheRefreshMillis', async () => {
    prepareJsonResponse({ data: [] });

    let currentTime = 1_000_000;
    const provider = createNebul({
      metadataCacheRefreshMillis: 1000 * 60,
      _internal: { currentDate: () => new Date(currentTime) },
    });

    await provider.getAvailableModels();
    currentTime += 1000 * 60 + 1;
    await provider.getAvailableModels();

    await vi.waitFor(() => {
      expect(server.calls.length).toBe(2);
    });
  });

  it('should refetch after a failed request', async () => {
    server.urls['https://api.inference.nebul.io/model/info'].response = {
      type: 'error',
      status: 500,
      body: JSON.stringify({
        detail: { message: 'catalog temporarily unavailable' },
      }),
    };

    const provider = createNebul({ apiKey: 'test-api-key' });

    await expect(provider.getAvailableModels()).rejects.toThrow(
      'catalog temporarily unavailable',
    );
    expect(server.calls.length).toBe(1);

    prepareJsonResponse({ data: [] });
    await expect(provider.getAvailableModels()).resolves.toEqual([]);
    expect(server.calls.length).toBe(2);
  });
});
