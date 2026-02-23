import { describe, it, expect, vi } from 'vitest';
import { withFallback } from './with-fallback';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';

describe('withFallback', () => {
  describe('doGenerate', () => {
    it('should use the first model when it succeeds', async () => {
      const primaryModel = new MockLanguageModelV3({
        modelId: 'primary',
        doGenerate: {
          text: 'primary response',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5 },
        },
      });

      const fallbackModel = new MockLanguageModelV3({
        modelId: 'fallback',
        doGenerate: {
          text: 'fallback response',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5 },
        },
      });

      const model = withFallback({
        models: [primaryModel, fallbackModel],
      });

      const result = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      });

      expect(result.text).toBe('primary response');
      expect(primaryModel.doGenerateCalls.length).toBe(1);
      expect(fallbackModel.doGenerateCalls.length).toBe(0);
    });

    it('should fall back to second model when first fails', async () => {
      const primaryModel = new MockLanguageModelV3({
        modelId: 'primary',
        doGenerate: async () => {
          throw new Error('primary model failed');
        },
      });

      const fallbackModel = new MockLanguageModelV3({
        modelId: 'fallback',
        doGenerate: {
          text: 'fallback response',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5 },
        },
      });

      const model = withFallback({
        models: [primaryModel, fallbackModel],
      });

      const result = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      });

      expect(result.text).toBe('fallback response');
    });

    it('should throw when all models fail', async () => {
      const model1 = new MockLanguageModelV3({
        modelId: 'model1',
        doGenerate: async () => {
          throw new Error('model1 failed');
        },
      });

      const model2 = new MockLanguageModelV3({
        modelId: 'model2',
        doGenerate: async () => {
          throw new Error('model2 failed');
        },
      });

      const model = withFallback({ models: [model1, model2] });

      await expect(
        model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: [
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
        }),
      ).rejects.toThrow('model2 failed');
    });

    it('should call onModelFailure when a model fails', async () => {
      const onModelFailure = vi.fn();

      const primaryModel = new MockLanguageModelV3({
        modelId: 'primary',
        doGenerate: async () => {
          throw new Error('primary failed');
        },
      });

      const fallbackModel = new MockLanguageModelV3({
        modelId: 'fallback',
        doGenerate: {
          text: 'fallback response',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5 },
        },
      });

      const model = withFallback({
        models: [primaryModel, fallbackModel],
        onModelFailure,
      });

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      });

      expect(onModelFailure).toHaveBeenCalledTimes(1);
      expect(onModelFailure).toHaveBeenCalledWith({
        model: primaryModel,
        error: expect.any(Error),
        modelIndex: 0,
      });
    });

    it('should try three models in sequence', async () => {
      const model1 = new MockLanguageModelV3({
        modelId: 'model1',
        doGenerate: async () => {
          throw new Error('model1 failed');
        },
      });

      const model2 = new MockLanguageModelV3({
        modelId: 'model2',
        doGenerate: async () => {
          throw new Error('model2 failed');
        },
      });

      const model3 = new MockLanguageModelV3({
        modelId: 'model3',
        doGenerate: {
          text: 'model3 response',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5 },
        },
      });

      const model = withFallback({ models: [model1, model2, model3] });

      const result = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      });

      expect(result.text).toBe('model3 response');
    });
  });

  describe('model properties', () => {
    it('should use primary model provider', () => {
      const model = withFallback({
        models: [
          new MockLanguageModelV3({ provider: 'openai', modelId: 'gpt-4' }),
          new MockLanguageModelV3({
            provider: 'anthropic',
            modelId: 'claude',
          }),
        ],
      });

      expect(model.provider).toBe('openai');
    });

    it('should create composite modelId', () => {
      const model = withFallback({
        models: [
          new MockLanguageModelV3({ modelId: 'gpt-4' }),
          new MockLanguageModelV3({ modelId: 'claude' }),
        ],
      });

      expect(model.modelId).toBe('fallback(gpt-4, claude)');
    });

    it('should have v3 specification version', () => {
      const model = withFallback({
        models: [new MockLanguageModelV3(), new MockLanguageModelV3()],
      });

      expect(model.specificationVersion).toBe('v3');
    });
  });

  describe('doStream', () => {
    it('should fall back on stream failure', async () => {
      const primaryModel = new MockLanguageModelV3({
        modelId: 'primary',
        doStream: async () => {
          throw new Error('stream failed');
        },
      });

      const fallbackModel = new MockLanguageModelV3({
        modelId: 'fallback',
        doStream: {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: 'fallback',
              });
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 10, outputTokens: 5 },
              });
              controller.close();
            },
          }),
        },
      });

      const model = withFallback({
        models: [primaryModel, fallbackModel],
      });

      const result = await model.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      });

      expect(result).toBeDefined();
      expect(result.stream).toBeDefined();
    });
  });

  describe('abort handling', () => {
    it('should not catch abort errors', async () => {
      const primaryModel = new MockLanguageModelV3({
        modelId: 'primary',
        doGenerate: async () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          throw error;
        },
      });

      const fallbackModel = new MockLanguageModelV3({
        modelId: 'fallback',
        doGenerate: {
          text: 'should not reach',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5 },
        },
      });

      const model = withFallback({
        models: [primaryModel, fallbackModel],
      });

      await expect(
        model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: [
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
        }),
      ).rejects.toThrow('aborted');

      // Fallback should NOT have been called
      expect(fallbackModel.doGenerateCalls.length).toBe(0);
    });
  });
});
