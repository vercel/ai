import { LanguageModelV2CallOptions } from '@ai-sdk/provider';
import { defaultSettingsMiddleware } from './default-settings-middleware';

const BASE_PARAMS: LanguageModelV2CallOptions = {
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
          providerOptions: {
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
      expect(result.providerOptions).toEqual({
        anthropic: {
          cacheControl: { type: 'ephemeral' },
        },
      });
    });

    it('should merge complex provider metadata objects', async () => {
      const middleware = defaultSettingsMiddleware({
        settings: {
          providerOptions: {
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
          providerOptions: {
            anthropic: {
              feature: { enabled: false },
              otherSetting: 'value',
            },
          },
        },
      });

      expect(result.providerOptions).toEqual({
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
          providerOptions: {
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
          providerOptions: {
            anthropic: {
              tools: {
                retrieval: { enabled: false },
                code: { enabled: true },
              },
            },
          },
        },
      });

      expect(result.providerOptions).toEqual({
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

  describe('temperature', () => {
    it('should keep 0 if settings.temperature is not set', async () => {
      const middleware = defaultSettingsMiddleware({
        settings: {},
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: { ...BASE_PARAMS, temperature: 0 },
      });

      expect(result.temperature).toBe(0);
    });

    it("should reset the temperature to undefined if it's null", async () => {
      const middleware = defaultSettingsMiddleware({
        settings: { temperature: null },
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: { ...BASE_PARAMS, temperature: 0 },
      });

      expect(result.temperature).toBe(undefined);
    });
  });

  describe('headers', () => {
    it('should merge headers', async () => {
      const middleware = defaultSettingsMiddleware({
        settings: {
          headers: { 'X-Custom-Header': 'test', 'X-Another-Header': 'test2' },
        },
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          headers: { 'X-Custom-Header': 'test2' },
        },
      });

      expect(result.headers).toEqual({
        'X-Custom-Header': 'test2',
        'X-Another-Header': 'test2',
      });
    });
  });
});
