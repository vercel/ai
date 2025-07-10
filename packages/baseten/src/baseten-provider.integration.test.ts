import { describe, it, expect, beforeAll } from 'vitest';
import { baseten, createBaseten } from '@ai-sdk/baseten';
import { generateText, embed } from '../../ai';

// ============================================================================
// CONFIGURATION - Update these URLs with your own model endpoints to run the tests
// ============================================================================

// Embedding model URLs (example: Nomic Embed)
const EMBEDDING_SYNC_V1_URL =
  'https://model-03y7n6e3.api.baseten.co/environments/production/sync/v1';
const EMBEDDING_PREDICT_URL =
  'https://model-03y7n6e3.api.baseten.co/environments/production/predict';

// Chat model URL (example: Qwen 3 4B)
const CHAT_SYNC_V1_URL =
  'https://model-6wg17egw.api.baseten.co/environments/production/sync/v1';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

// Skip integration tests if no API key is available
const hasApiKey =
  process.env.BASETEN_API_KEY && process.env.BASETEN_API_KEY !== '';

describe('BasetenProvider Integration Tests', () => {
  beforeAll(() => {
    if (!hasApiKey) {
      console.warn(
        '⚠️  BASETEN_API_KEY not found. Skipping integration tests.',
      );
    }
  });

  describe('Default Model APIs', () => {
    it('should generate text with default Model APIs', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }

      const { text } = await generateText({
        model: baseten('deepseek-ai/DeepSeek-V3-0324') as any,
        prompt: 'What is the meaning of life? Answer in one sentence.',
      });

      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    }, 30000);

    it('should work with different models', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }

      const { text } = await generateText({
        model: baseten('meta-llama/Llama-4-Maverick-17B-128E-Instruct') as any,
        prompt: 'Explain quantum computing in simple terms.',
      });

      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    }, 30000);

    it('should support provider methods', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }

      // Test the provider function directly
      const model1 = baseten('deepseek-ai/DeepSeek-V3-0324');
      expect(model1).toBeDefined();

      // Test chatModel method
      const model2 = baseten.chatModel('deepseek-ai/DeepSeek-V3-0324');
      expect(model2).toBeDefined();

      // Test languageModel method
      const model3 = baseten.languageModel('deepseek-ai/DeepSeek-V3-0324');
      expect(model3).toBeDefined();
    });
  });

  describe('Custom Model URLs', () => {
    it('should work with embeddings using /sync/v1 endpoint', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }
      // Nomic Embed Code
      const embeddingBaseten = createBaseten({
        modelURL: EMBEDDING_SYNC_V1_URL,
      });

      const embeddingModel = embeddingBaseten.textEmbeddingModel();
      expect(embeddingModel).toBeDefined();

      const { embedding, usage } = await embed({
        model: embeddingModel as any,
        value: 'sunny day at the beach',
      });

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    }, 30000);

    it('should work with embeddings using /predict endpoint', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }

      // Nomic Embed Code
      const embeddingBaseten = createBaseten({
        modelURL: EMBEDDING_PREDICT_URL,
      });

      const embeddingModel = embeddingBaseten.textEmbeddingModel();
      expect(embeddingModel).toBeDefined();

      const { embedding, usage } = await embed({
        model: embeddingModel as any,
        value: 'sunny day at the beach',
      });

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    }, 30000);

    it('should work with chat using /sync/v1 endpoint', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }

      // Qwen 3 4B
      const customBaseten = createBaseten({
        modelURL: CHAT_SYNC_V1_URL,
      });

      const customChatModel = customBaseten();
      expect(customChatModel).toBeDefined();

      const { text } = await generateText({
        model: customChatModel as any,
        prompt: 'Say hello from the OpenAI-compatible chat model!',
      });

      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should throw error for embeddings without modelURL', () => {
      expect(() => {
        baseten.textEmbeddingModel();
      }).toThrow(
        'No model URL provided for embeddings. Please set modelURL option for embeddings.',
      );
    });

    it('should throw error for unsupported image models', () => {
      expect(() => {
        baseten.imageModel('test-model');
      }).toThrow();
    });
  });

  describe('Optional Model IDs', () => {
    it('should work with empty constructor for chat models', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }

      const customBaseten = createBaseten({
        modelURL: CHAT_SYNC_V1_URL,
      });

      // Should work without modelId
      const model = customBaseten();
      expect(model).toBeDefined();

      const { text } = await generateText({
        model: model as any,
        prompt: 'Test message',
      });

      expect(text).toBeDefined();
    }, 30000);

    it('should work with empty constructor for language models', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }

      const customBaseten = createBaseten({
        modelURL: CHAT_SYNC_V1_URL,
      });

      // Should work without modelId
      const model = customBaseten.languageModel();
      expect(model).toBeDefined();

      const { text } = await generateText({
        model: model as any,
        prompt: 'Test message',
      });

      expect(text).toBeDefined();
    }, 30000);
  });
});
