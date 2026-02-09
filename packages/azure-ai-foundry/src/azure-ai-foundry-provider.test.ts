import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NoSuchModelError } from '@ai-sdk/provider';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

// Mock model constructors + tool exports consumed by azure-ai-foundry-tools.ts
vi.mock('@ai-sdk/openai/internal', () => ({
  OpenAIChatLanguageModel: vi.fn(() => ({ type: 'openai-chat' })),
  OpenAICompletionLanguageModel: vi.fn(() => ({
    type: 'openai-completion',
  })),
  OpenAIEmbeddingModel: vi.fn(() => ({ type: 'openai-embedding' })),
  OpenAIImageModel: vi.fn(() => ({ type: 'openai-image' })),
  OpenAIResponsesLanguageModel: vi.fn(() => ({
    type: 'openai-responses',
  })),
  OpenAISpeechModel: vi.fn(() => ({ type: 'openai-speech' })),
  OpenAITranscriptionModel: vi.fn(() => ({
    type: 'openai-transcription',
  })),
  // Tool exports used by azure-ai-foundry-tools.ts
  codeInterpreter: { type: 'provider-defined-tool' },
  fileSearch: { type: 'provider-defined-tool' },
  imageGeneration: { type: 'provider-defined-tool' },
  webSearchPreview: { type: 'provider-defined-tool' },
}));

vi.mock('@ai-sdk/anthropic/internal', () => ({
  AnthropicMessagesLanguageModel: vi.fn(() => ({ type: 'anthropic' })),
  // anthropicTools used by azure-ai-foundry-tools.ts
  anthropicTools: {
    bash_20241022: { type: 'provider-defined-tool' },
    bash_20250124: { type: 'provider-defined-tool' },
    codeExecution_20250522: { type: 'provider-defined-tool' },
    codeExecution_20250825: { type: 'provider-defined-tool' },
    computer_20241022: { type: 'provider-defined-tool' },
    computer_20250124: { type: 'provider-defined-tool' },
    computer_20251124: { type: 'provider-defined-tool' },
    memory_20250818: { type: 'provider-defined-tool' },
    textEditor_20241022: { type: 'provider-defined-tool' },
    textEditor_20250124: { type: 'provider-defined-tool' },
    textEditor_20250429: { type: 'provider-defined-tool' },
    textEditor_20250728: { type: 'provider-defined-tool' },
    webFetch_20250910: { type: 'provider-defined-tool' },
    webSearch_20250305: { type: 'provider-defined-tool' },
    toolSearchRegex_20251119: { type: 'provider-defined-tool' },
    toolSearchBm25_20251119: { type: 'provider-defined-tool' },
  },
}));

import {
  OpenAIChatLanguageModel,
  OpenAICompletionLanguageModel,
  OpenAIEmbeddingModel,
  OpenAIImageModel,
  OpenAIResponsesLanguageModel,
  OpenAISpeechModel,
  OpenAITranscriptionModel,
} from '@ai-sdk/openai/internal';

import { AnthropicMessagesLanguageModel } from '@ai-sdk/anthropic/internal';

import { createAzureAIFoundry } from './azure-ai-foundry-provider';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MockOpenAIChatLanguageModel = OpenAIChatLanguageModel as Mock;
const MockOpenAICompletionLanguageModel = OpenAICompletionLanguageModel as Mock;
const MockOpenAIEmbeddingModel = OpenAIEmbeddingModel as Mock;
const MockOpenAIImageModel = OpenAIImageModel as Mock;
const MockOpenAIResponsesLanguageModel = OpenAIResponsesLanguageModel as Mock;
const MockOpenAISpeechModel = OpenAISpeechModel as Mock;
const MockOpenAITranscriptionModel = OpenAITranscriptionModel as Mock;
const MockAnthropicMessagesLanguageModel =
  AnthropicMessagesLanguageModel as unknown as Mock;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createAzureAIFoundry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Routing ──────────────────────────────────────────────────────────────

  describe('routing', () => {
    const provider = createAzureAIFoundry({
      baseURL: 'https://test.services.ai.azure.com',
      apiKey: 'test-key',
    });

    it('default callable with claude model routes to AnthropicMessagesLanguageModel', () => {
      provider('claude-sonnet-4-5');
      expect(MockAnthropicMessagesLanguageModel).toHaveBeenCalledOnce();
      expect(MockOpenAIResponsesLanguageModel).not.toHaveBeenCalled();
    });

    it('default callable with gpt model routes to OpenAIResponsesLanguageModel', () => {
      provider('gpt-4o');
      expect(MockOpenAIResponsesLanguageModel).toHaveBeenCalledOnce();
      expect(MockAnthropicMessagesLanguageModel).not.toHaveBeenCalled();
    });

    it('default callable with DeepSeek model routes to OpenAIResponsesLanguageModel', () => {
      provider('DeepSeek-R1');
      expect(MockOpenAIResponsesLanguageModel).toHaveBeenCalledOnce();
      expect(MockAnthropicMessagesLanguageModel).not.toHaveBeenCalled();
    });

    it('default callable with custom name in anthropicDeployments routes to Anthropic', () => {
      const customProvider = createAzureAIFoundry({
        baseURL: 'https://test.services.ai.azure.com',
        apiKey: 'test-key',
        anthropicDeployments: ['my-custom-claude'],
      });

      customProvider('my-custom-claude');
      expect(MockAnthropicMessagesLanguageModel).toHaveBeenCalledOnce();
      expect(MockOpenAIResponsesLanguageModel).not.toHaveBeenCalled();
    });

    it('languageModel auto-detects Claude and routes to AnthropicMessagesLanguageModel', () => {
      provider.languageModel('claude-sonnet-4-5');
      expect(MockAnthropicMessagesLanguageModel).toHaveBeenCalledOnce();
      expect(MockOpenAIResponsesLanguageModel).not.toHaveBeenCalled();
    });

    it('languageModel auto-detects non-Claude and routes to OpenAIResponsesLanguageModel', () => {
      provider.languageModel('gpt-4o');
      expect(MockOpenAIResponsesLanguageModel).toHaveBeenCalledOnce();
      expect(MockAnthropicMessagesLanguageModel).not.toHaveBeenCalled();
    });

    it('responses() with Claude model throws NoSuchModelError', () => {
      expect(() => provider.responses('claude-sonnet-4-5')).toThrow(
        NoSuchModelError,
      );
    });

    it('anthropic() always routes to AnthropicMessagesLanguageModel', () => {
      provider.anthropic('any-deployment-name');
      expect(MockAnthropicMessagesLanguageModel).toHaveBeenCalledOnce();
    });

    it('chat() always routes to OpenAIChatLanguageModel', () => {
      provider.chat('any-deployment-name');
      expect(MockOpenAIChatLanguageModel).toHaveBeenCalledOnce();
    });
  });

  // ── URL construction ─────────────────────────────────────────────────────

  describe('URL construction', () => {
    it('resourceName builds base URL as https://{resourceName}.services.ai.azure.com', () => {
      const provider = createAzureAIFoundry({
        resourceName: 'test-resource',
        apiKey: 'test-key',
      });

      provider('gpt-4o');

      const config = MockOpenAIResponsesLanguageModel.mock.calls[0][1] as {
        url: (args: { path: string; modelId: string }) => string;
      };
      const url = config.url({ path: '/responses', modelId: 'gpt-4o' });
      expect(url).toContain(
        'https://test-resource.services.ai.azure.com/openai/v1/responses',
      );
    });

    it('custom baseURL is used as-is', () => {
      const provider = createAzureAIFoundry({
        baseURL: 'https://custom.endpoint.com',
        apiKey: 'test-key',
      });

      provider('gpt-4o');

      const config = MockOpenAIResponsesLanguageModel.mock.calls[0][1] as {
        url: (args: { path: string; modelId: string }) => string;
      };
      const url = config.url({ path: '/responses', modelId: 'gpt-4o' });
      expect(url).toContain('https://custom.endpoint.com/openai/v1/responses');
    });

    it('OpenAI URL includes /openai/v1{path} with default api-version=v1', () => {
      const provider = createAzureAIFoundry({
        baseURL: 'https://test.services.ai.azure.com',
        apiKey: 'test-key',
      });

      provider('gpt-4o');

      const config = MockOpenAIResponsesLanguageModel.mock.calls[0][1] as {
        url: (args: { path: string; modelId: string }) => string;
      };
      const url = config.url({
        path: '/chat/completions',
        modelId: 'gpt-4o',
      });
      expect(url).toBe(
        'https://test.services.ai.azure.com/openai/v1/chat/completions?api-version=v1',
      );
    });

    it('custom apiVersion is reflected in OpenAI URL', () => {
      const provider = createAzureAIFoundry({
        baseURL: 'https://test.services.ai.azure.com',
        apiKey: 'test-key',
        apiVersion: '2024-12-01-preview',
      });

      provider.chat('gpt-4o');

      const config = MockOpenAIChatLanguageModel.mock.calls[0][1] as {
        url: (args: { path: string; modelId: string }) => string;
      };
      const url = config.url({
        path: '/chat/completions',
        modelId: 'gpt-4o',
      });
      expect(url).toBe(
        'https://test.services.ai.azure.com/openai/v1/chat/completions?api-version=2024-12-01-preview',
      );
    });

    it('Anthropic base URL is {base}/anthropic/v1', () => {
      const provider = createAzureAIFoundry({
        baseURL: 'https://test.services.ai.azure.com',
        apiKey: 'test-key',
      });

      provider.anthropic('claude-sonnet-4-5');

      const config = MockAnthropicMessagesLanguageModel.mock.calls[0][1] as {
        baseURL: string;
      };
      expect(config.baseURL).toBe(
        'https://test.services.ai.azure.com/anthropic/v1',
      );
    });

    it('legacy deployment URL for transcription uses /openai/deployments/{modelId}/{path}', () => {
      const provider = createAzureAIFoundry({
        baseURL: 'https://test.services.ai.azure.com',
        apiKey: 'test-key',
      });

      provider.transcription('whisper');

      const config = MockOpenAITranscriptionModel.mock.calls[0][1] as {
        url: (args: { path: string; modelId: string }) => string;
      };
      const url = config.url({
        path: '/audio/transcriptions',
        modelId: 'whisper',
      });
      expect(url).toBe(
        'https://test.services.ai.azure.com/openai/deployments/whisper/audio/transcriptions?api-version=2025-04-01-preview',
      );
    });

    it('legacy deployment URL for speech uses /openai/deployments/{modelId}/{path}', () => {
      const provider = createAzureAIFoundry({
        baseURL: 'https://test.services.ai.azure.com',
        apiKey: 'test-key',
      });

      provider.speech('tts-1');

      const config = MockOpenAISpeechModel.mock.calls[0][1] as {
        url: (args: { path: string; modelId: string }) => string;
      };
      const url = config.url({
        path: '/audio/speech',
        modelId: 'tts-1',
      });
      expect(url).toBe(
        'https://test.services.ai.azure.com/openai/deployments/tts-1/audio/speech?api-version=2025-04-01-preview',
      );
    });

    it('trailing slash on baseURL is stripped', () => {
      const provider = createAzureAIFoundry({
        baseURL: 'https://test.services.ai.azure.com/',
        apiKey: 'test-key',
      });

      provider('gpt-4o');

      const config = MockOpenAIResponsesLanguageModel.mock.calls[0][1] as {
        url: (args: { path: string; modelId: string }) => string;
      };
      const url = config.url({ path: '/responses', modelId: 'gpt-4o' });
      expect(url).toContain(
        'https://test.services.ai.azure.com/openai/v1/responses',
      );
      // Should NOT have double slash
      expect(url).not.toContain('.com//openai');
    });
  });

  // ── Model instantiation ──────────────────────────────────────────────────

  describe('model instantiation', () => {
    const provider = createAzureAIFoundry({
      baseURL: 'https://test.services.ai.azure.com',
      apiKey: 'test-key',
    });

    it('embeddingModel() calls OpenAIEmbeddingModel constructor', () => {
      provider.embeddingModel('text-embedding-3-large');
      expect(MockOpenAIEmbeddingModel).toHaveBeenCalledOnce();
      expect(MockOpenAIEmbeddingModel.mock.calls[0][0]).toBe(
        'text-embedding-3-large',
      );
    });

    it('imageModel() calls OpenAIImageModel constructor', () => {
      provider.imageModel('dall-e-3');
      expect(MockOpenAIImageModel).toHaveBeenCalledOnce();
      expect(MockOpenAIImageModel.mock.calls[0][0]).toBe('dall-e-3');
    });

    it('transcription() calls OpenAITranscriptionModel constructor', () => {
      provider.transcription('whisper');
      expect(MockOpenAITranscriptionModel).toHaveBeenCalledOnce();
      expect(MockOpenAITranscriptionModel.mock.calls[0][0]).toBe('whisper');
    });

    it('speech() calls OpenAISpeechModel constructor', () => {
      provider.speech('tts-1');
      expect(MockOpenAISpeechModel).toHaveBeenCalledOnce();
      expect(MockOpenAISpeechModel.mock.calls[0][0]).toBe('tts-1');
    });

    it('completion() calls OpenAICompletionLanguageModel constructor', () => {
      provider.completion('gpt-3.5-turbo-instruct');
      expect(MockOpenAICompletionLanguageModel).toHaveBeenCalledOnce();
      expect(MockOpenAICompletionLanguageModel.mock.calls[0][0]).toBe(
        'gpt-3.5-turbo-instruct',
      );
    });

    it('chat() passes provider name azure-ai-foundry.chat', () => {
      provider.chat('gpt-4o');
      const config = MockOpenAIChatLanguageModel.mock.calls[0][1] as {
        provider: string;
      };
      expect(config.provider).toBe('azure-ai-foundry.chat');
    });

    it('responses() passes provider name azure-ai-foundry.responses', () => {
      provider.responses('gpt-4o');
      const config = MockOpenAIResponsesLanguageModel.mock.calls[0][1] as {
        provider: string;
      };
      expect(config.provider).toBe('azure-ai-foundry.responses');
    });

    it('anthropic() passes provider name azure-ai-foundry.anthropic', () => {
      provider.anthropic('claude-sonnet-4-5');
      const config = MockAnthropicMessagesLanguageModel.mock.calls[0][1] as {
        provider: string;
      };
      expect(config.provider).toBe('azure-ai-foundry.anthropic');
    });

    it('embeddingModel() passes provider name azure-ai-foundry.embedding', () => {
      provider.embeddingModel('text-embedding-3-large');
      const config = MockOpenAIEmbeddingModel.mock.calls[0][1] as {
        provider: string;
      };
      expect(config.provider).toBe('azure-ai-foundry.embedding');
    });

    it('imageModel() passes provider name azure-ai-foundry.image', () => {
      provider.imageModel('dall-e-3');
      const config = MockOpenAIImageModel.mock.calls[0][1] as {
        provider: string;
      };
      expect(config.provider).toBe('azure-ai-foundry.image');
    });

    it('transcription() passes provider name azure-ai-foundry.transcription', () => {
      provider.transcription('whisper');
      const config = MockOpenAITranscriptionModel.mock.calls[0][1] as {
        provider: string;
      };
      expect(config.provider).toBe('azure-ai-foundry.transcription');
    });

    it('speech() passes provider name azure-ai-foundry.speech', () => {
      provider.speech('tts-1');
      const config = MockOpenAISpeechModel.mock.calls[0][1] as {
        provider: string;
      };
      expect(config.provider).toBe('azure-ai-foundry.speech');
    });

    it('completion() passes provider name azure-ai-foundry.completion', () => {
      provider.completion('gpt-3.5-turbo-instruct');
      const config = MockOpenAICompletionLanguageModel.mock.calls[0][1] as {
        provider: string;
      };
      expect(config.provider).toBe('azure-ai-foundry.completion');
    });

    it('responses() passes fileIdPrefixes for assistant files', () => {
      provider.responses('gpt-4o');
      const config = MockOpenAIResponsesLanguageModel.mock.calls[0][1] as {
        fileIdPrefixes: readonly string[];
      };
      expect(config.fileIdPrefixes).toEqual(['assistant-']);
    });
  });

  // ── Claude guard clauses ─────────────────────────────────────────────────

  describe('Claude guard clauses', () => {
    const provider = createAzureAIFoundry({
      baseURL: 'https://test.services.ai.azure.com',
      apiKey: 'test-key',
    });

    it('embeddingModel() throws NoSuchModelError for Claude models', () => {
      try {
        provider.embeddingModel('claude-sonnet-4-5');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(NoSuchModelError.isInstance(error)).toBe(true);
        expect((error as NoSuchModelError).modelId).toBe('claude-sonnet-4-5');
        expect((error as NoSuchModelError).modelType).toBe('embeddingModel');
      }
    });

    it('imageModel() throws NoSuchModelError for Claude models', () => {
      try {
        provider.imageModel('claude-opus-4-1');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(NoSuchModelError.isInstance(error)).toBe(true);
        expect((error as NoSuchModelError).modelId).toBe('claude-opus-4-1');
        expect((error as NoSuchModelError).modelType).toBe('imageModel');
      }
    });

    it('responses() throws NoSuchModelError for Claude models', () => {
      try {
        provider.responses('claude-haiku-4-5');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(NoSuchModelError.isInstance(error)).toBe(true);
        expect((error as NoSuchModelError).modelId).toBe('claude-haiku-4-5');
        expect((error as NoSuchModelError).modelType).toBe('languageModel');
      }
    });

    it('embeddingModel() throws NoSuchModelError for custom anthropicDeployments', () => {
      const customProvider = createAzureAIFoundry({
        baseURL: 'https://test.services.ai.azure.com',
        apiKey: 'test-key',
        anthropicDeployments: ['my-claude'],
      });

      try {
        customProvider.embeddingModel('my-claude');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(NoSuchModelError.isInstance(error)).toBe(true);
        expect((error as NoSuchModelError).modelId).toBe('my-claude');
        expect((error as NoSuchModelError).modelType).toBe('embeddingModel');
      }
    });
  });

  // ── Constructor rejection ────────────────────────────────────────────────

  describe('constructor rejection', () => {
    it('throws when called with new keyword', () => {
      const provider = createAzureAIFoundry({
        baseURL: 'https://test.services.ai.azure.com',
        apiKey: 'test-key',
      });

      // The provider is a function with new.target guard.
      // We need to use Reflect.construct to trigger new.target.
      expect(() => {
        Reflect.construct(
          provider as unknown as new (...args: unknown[]) => unknown,
          ['gpt-4o'],
        );
      }).toThrow(/new keyword/);
    });
  });

  // ── specificationVersion ─────────────────────────────────────────────────

  describe('specificationVersion', () => {
    it('is v3', () => {
      const provider = createAzureAIFoundry({
        baseURL: 'https://test.services.ai.azure.com',
        apiKey: 'test-key',
      });

      // specificationVersion is inherited from ProviderV3 but not re-declared
      // on the AzureAIFoundryProvider callable interface, so access via index
      const spec = (provider as unknown as Record<string, unknown>)[
        'specificationVersion'
      ];
      expect(spec).toBe('v3');
    });
  });
});
