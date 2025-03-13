import { LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { defaultSettingsMiddleware } from './default-settings-middleware';

const BASE_PARAMS: LanguageModelV1CallOptions = {
  mode: { type: 'regular' },
  prompt: [
    { role: 'user', content: [{ type: 'text', text: 'Hello, world!' }] },
  ],
  inputFormat: 'prompt',
};

describe('defaultSettingsMiddleware', () => {
  describe('transformParams', () => {
    it('should apply default settings', async () => {
      const middleware = defaultSettingsMiddleware({
        settings: { temperature: 0.7 },
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
        },
      });

      expect(result.temperature).toBe(0.7);
    });

    it('should give precedence to user-provided settings', async () => {
      const middleware = defaultSettingsMiddleware({
        settings: { temperature: 0.7 },
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          temperature: 0.5,
        },
      });

      expect(result.temperature).toBe(0.5);
    });

    it('should merge provider metadata with default settings', async () => {
      const middleware = defaultSettingsMiddleware({
        settings: {
          temperature: 0.7,
          providerMetadata: {
            anthropic: {
              cacheControl: { type: 'ephemeral' },
            },
          },
        },
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
        },
      });

      expect(result.temperature).toBe(0.7);
      expect(result.providerMetadata).toEqual({
        anthropic: {
          cacheControl: { type: 'ephemeral' },
        },
      });
    });

    it('should merge complex provider metadata objects', async () => {
      const middleware = defaultSettingsMiddleware({
        settings: {
          providerMetadata: {
            anthropic: {
              cacheControl: { type: 'ephemeral' },
              feature: { enabled: true },
            },
            openai: {
              logit_bias: { '50256': -100 },
            },
          },
        },
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          providerMetadata: {
            anthropic: {
              feature: { enabled: false },
              otherSetting: 'value',
            },
          },
        },
      });

      expect(result.providerMetadata).toEqual({
        anthropic: {
          cacheControl: { type: 'ephemeral' },
          feature: { enabled: false },
          otherSetting: 'value',
        },
        openai: {
          logit_bias: { '50256': -100 },
        },
      });
    });

    it('should handle nested provider metadata objects correctly', async () => {
      const middleware = defaultSettingsMiddleware({
        settings: {
          providerMetadata: {
            anthropic: {
              tools: {
                retrieval: { enabled: true },
                math: { enabled: true },
              },
            },
          },
        },
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          providerMetadata: {
            anthropic: {
              tools: {
                retrieval: { enabled: false },
                code: { enabled: true },
              },
            },
          },
        },
      });

      expect(result.providerMetadata).toEqual({
        anthropic: {
          tools: {
            retrieval: { enabled: false },
            math: { enabled: true },
            code: { enabled: true },
          },
        },
      });
    });
  });
});
