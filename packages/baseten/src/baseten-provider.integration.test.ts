import { describe, it, expect, beforeAll } from 'vitest';
import { baseten, createBaseten } from '@ai-sdk/baseten';
import { embed, embedMany, generateText } from '../../ai';

// You need to fill these values to run this test suite
const EMBEDDING_MODEL_ID = '03y7n6e3';
const CHAT_MODEL_ID = '6wg17egw';

// ============================================================================
// BASETEN EMBEDDING PROVIDER INTEGRATION TESTS
// ============================================================================
// 
// This test suite validates the Baseten embedding provider with Performance Client.
// 
// Endpoint Types:
// - /sync: OpenAI-compatible endpoints (Performance Client adds /v1/embeddings)
// - /predict: Custom Baseten endpoints (Performance Client uses URL as-is)
// 
// Performance Client Configuration:
// - Max concurrent requests: 128
// - Batch size: 16
// - Timeout: 720 seconds
// 
// ============================================================================

// ============================================================================
// CONFIGURATION - Update these URLs with your own model endpoints to run the tests
// ============================================================================

// Embedding model URLs - Performance Client with different endpoint types
const EMBEDDING_SYNC_URL =
  `https://model-${EMBEDDING_MODEL_ID}.api.baseten.co/environments/production/sync`;
const EMBEDDING_SYNC_V1_URL =
`https://model-${EMBEDDING_MODEL_ID}.api.baseten.co/environments/production/sync/v1`;
const EMBEDDING_PREDICT_URL =
  `https://model-${EMBEDDING_MODEL_ID}.api.baseten.co/environments/production/predict`;

// Chat model URL (example: Qwen 3 4B)
const CHAT_SYNC_V1_URL =
  `https://model-${CHAT_MODEL_ID}.api.baseten.co/environments/production/sync/v1`;

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
        model: baseten('openai/gpt-oss-120b') as any,
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


    it('should work with embeddings using /sync endpoint (Performance Client)', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }
      // Test Performance Client with OpenAI-compatible /sync endpoint
      const embeddingBaseten = createBaseten({
        modelURL: EMBEDDING_SYNC_URL,
      });

      const embeddingModel = embeddingBaseten.textEmbeddingModel();
      expect(embeddingModel).toBeDefined();

      console.log('🔍 Testing embed with URL:', EMBEDDING_SYNC_URL);
      
      const { embedding, usage } = await embed({
        model: embeddingModel as any,
        value: 'sunny day at the beach',
      });

      console.log('📊 Embed result:');
      console.log('  - Embedding length:', embedding.length);
      console.log('  - First 5 values:', embedding.slice(0, 5));
      console.log('  - Usage:', usage);
      console.log('  - Full embedding (first 10):', embedding.slice(0, 10));

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    }, 30000);

    it('should work with multiple texts using /sync endpoint (Performance Client batching)', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }

      // Test Performance Client batching with multiple texts
      const embeddingBaseten = createBaseten({
        modelURL: EMBEDDING_SYNC_URL,
      });

      const embeddingModel = embeddingBaseten.textEmbeddingModel();
      expect(embeddingModel).toBeDefined();

      console.log('🔍 Testing embedMany with URL:', EMBEDDING_SYNC_URL);
      
      const { embeddings, usage } = await embedMany({
        model: embeddingModel as any,
        values: [
          'sunny day at the beach',
          'rainy afternoon in the city',
          'snowy mountain peak',
        ],
      });

      console.log('📊 EmbedMany result:');
      console.log('  - Number of embeddings:', embeddings.length);
      console.log('  - First embedding length:', embeddings[0].length);
      console.log('  - First embedding (first 5):', embeddings[0].slice(0, 5));
      console.log('  - Usage:', usage);

      expect(embeddings).toBeDefined();
      expect(Array.isArray(embeddings)).toBe(true);
      expect(embeddings.length).toBe(3);
      expect(embeddings[0]).toBeDefined();
      expect(Array.isArray(embeddings[0])).toBe(true);
      expect(embeddings[0].length).toBeGreaterThan(0);
    }, 30000);

    it('should work with embeddings using /sync/v1 endpoint (strips /v1 for Performance Client)', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping test - no API key');
        return;
      }
      // Test that /sync/v1 URLs work for embeddings (strips /v1 before passing to Performance Client)
      const embeddingBaseten = createBaseten({
        modelURL: EMBEDDING_SYNC_V1_URL,
      });

      const embeddingModel = embeddingBaseten.textEmbeddingModel();
      expect(embeddingModel).toBeDefined();

      console.log('🔍 Testing embed with /sync/v1 URL:', EMBEDDING_SYNC_V1_URL);
      
      const { embedding, usage } = await embed({
        model: embeddingModel as any,
        value: 'sunny day at the beach',
      });

      console.log('📊 Embed result with /sync/v1:');
      console.log('  - Embedding length:', embedding.length);
      console.log('  - First 5 values:', embedding.slice(0, 5));
      console.log('  - Usage:', usage);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    }, 30000);

    it('should fail with /predict endpoint for embeddings (not supported with Performance Client)', () => {
      // Test that /predict URLs are rejected for embeddings
      expect(() => {
        const embeddingBaseten = createBaseten({
          modelURL: EMBEDDING_PREDICT_URL,
        });
        embeddingBaseten.textEmbeddingModel();
      }).toThrow('Not supported. You must use a /sync or /sync/v1 endpoint for embeddings.');
    });

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
