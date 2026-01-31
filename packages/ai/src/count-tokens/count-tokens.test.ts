import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { jsonSchema, tool } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { countTokens } from './count-tokens';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

describe('countTokens', () => {
  describe('result.tokens', () => {
    it('should return token count', async () => {
      const result = await countTokens({
        model: new MockLanguageModelV3({
          doCountTokens: {
            tokens: 42,
            warnings: [],
          },
        }),
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.tokens).toBe(42);
    });
  });

  describe('result.warnings', () => {
    it('should include warnings from model', async () => {
      const result = await countTokens({
        model: new MockLanguageModelV3({
          doCountTokens: {
            tokens: 10,
            warnings: [{ type: 'other', message: 'Test warning' }],
          },
        }),
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.warnings).toEqual([
        { type: 'other', message: 'Test warning' },
      ]);
    });
  });

  describe('result.response', () => {
    it('should include response data', async () => {
      const result = await countTokens({
        model: new MockLanguageModelV3({
          doCountTokens: {
            tokens: 10,
            warnings: [],
            response: {
              headers: { 'x-request-id': 'test-123' },
              body: { input_tokens: 10 },
            },
          },
        }),
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.response?.headers?.['x-request-id']).toBe('test-123');
    });
  });

  describe('result.providerMetadata', () => {
    it('should include provider metadata', async () => {
      const result = await countTokens({
        model: new MockLanguageModelV3({
          doCountTokens: {
            tokens: 10,
            warnings: [],
            providerMetadata: {
              openai: { estimatedTokenCount: true },
            },
          },
        }),
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.providerMetadata?.openai?.estimatedTokenCount).toBe(true);
    });
  });

  describe('unsupported provider', () => {
    it('should throw UnsupportedFunctionalityError when provider does not support counting', async () => {
      await expect(
        countTokens({
          model: new MockLanguageModelV3({
            doCountTokens: undefined,
          }),
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow(UnsupportedFunctionalityError);
    });
  });

  describe('with tools', () => {
    it('should pass tools to model', async () => {
      const model = new MockLanguageModelV3({
        doCountTokens: {
          tokens: 50,
          warnings: [],
        },
      });

      const result = await countTokens({
        model,
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: {
          weather: tool({
            description: 'Get the weather',
            inputSchema: jsonSchema({
              type: 'object',
              properties: { location: { type: 'string' } },
            }),
          }),
        },
      });

      expect(result.tokens).toBe(50);
      expect(model.doCountTokensCalls).toHaveLength(1);
      expect(model.doCountTokensCalls[0].tools).toBeDefined();
      expect(model.doCountTokensCalls[0].tools?.[0].name).toBe('weather');
    });
  });

  describe('prompt options', () => {
    it('should accept simple prompt string', async () => {
      const model = new MockLanguageModelV3({
        doCountTokens: {
          tokens: 10,
          warnings: [],
        },
      });

      const result = await countTokens({
        model,
        prompt: 'Hello world',
      });

      expect(result.tokens).toBe(10);
      expect(model.doCountTokensCalls[0].prompt).toHaveLength(1);
      expect(model.doCountTokensCalls[0].prompt[0].role).toBe('user');
    });

    it('should accept system message', async () => {
      const model = new MockLanguageModelV3({
        doCountTokens: {
          tokens: 20,
          warnings: [],
        },
      });

      const result = await countTokens({
        model,
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.tokens).toBe(20);
      expect(model.doCountTokensCalls[0].prompt).toHaveLength(2);
      expect(model.doCountTokensCalls[0].prompt[0].role).toBe('system');
    });
  });

  describe('abort signal', () => {
    it('should pass abort signal to model', async () => {
      const abortController = new AbortController();
      const model = new MockLanguageModelV3({
        doCountTokens: async options => {
          expect(options.abortSignal).toBe(abortController.signal);
          return { tokens: 10, warnings: [] };
        },
      });

      await countTokens({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        abortSignal: abortController.signal,
      });
    });
  });

  describe('headers', () => {
    it('should pass headers to model', async () => {
      const model = new MockLanguageModelV3({
        doCountTokens: async options => {
          expect(options.headers?.['x-custom-header']).toBe('custom-value');
          return { tokens: 10, warnings: [] };
        },
      });

      await countTokens({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        headers: { 'x-custom-header': 'custom-value' },
      });
    });
  });
});
