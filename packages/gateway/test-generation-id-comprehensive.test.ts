import { describe, it, expect } from 'vitest';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { GatewayLanguageModel } from './src/gateway-language-model';
import {
  GatewayInvalidRequestError,
  GatewayInternalServerError,
  GatewayRateLimitError,
} from './src/errors';

const createModel = () =>
  new GatewayLanguageModel('test-model', {
    provider: 'test-provider',
    baseURL: 'https://api.test.com',
    headers: () => ({ Authorization: 'Bearer test' }),
    fetch: globalThis.fetch,
    o11yHeaders: {},
  });

describe('generationId in error messages - comprehensive', () => {
  const server = createTestServer({
    'https://api.test.com/language-model': {},
  });

  // ============== 400 Bad Request ==============
  describe('400 Bad Request (invalid_request_error)', () => {
    it('doGenerate - shows generationId in error message', async () => {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message: 'Invalid model parameters',
            type: 'invalid_request_error',
          },
          generationId: 'gen_400_GENERATE',
        }),
      };

      const model = createModel();
      try {
        await model.doGenerate({
          inputFormat: 'messages',
          mode: { type: 'regular' },
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(GatewayInvalidRequestError);
        expect(error.message).toContain('[gen_400_GENERATE]');
        expect(error.generationId).toBe('gen_400_GENERATE');
      }
    });

    it('doStream - shows generationId in error message', async () => {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message: 'Invalid model parameters',
            type: 'invalid_request_error',
          },
          generationId: 'gen_400_STREAM',
        }),
      };

      const model = createModel();
      try {
        await model.doStream({
          inputFormat: 'messages',
          mode: { type: 'regular' },
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(GatewayInvalidRequestError);
        expect(error.message).toContain('[gen_400_STREAM]');
        expect(error.generationId).toBe('gen_400_STREAM');
      }
    });
  });

  // ============== 500 Internal Server Error ==============
  describe('500 Internal Server Error', () => {
    it('doGenerate - shows generationId in error message', async () => {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'error',
        status: 500,
        body: JSON.stringify({
          error: {
            message: 'Internal server error',
            type: 'internal_server_error',
          },
          generationId: 'gen_500_GENERATE',
        }),
      };

      const model = createModel();
      try {
        await model.doGenerate({
          inputFormat: 'messages',
          mode: { type: 'regular' },
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(GatewayInternalServerError);
        expect(error.message).toContain('[gen_500_GENERATE]');
        expect(error.generationId).toBe('gen_500_GENERATE');
      }
    });

    it('doStream - shows generationId in error message', async () => {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'error',
        status: 500,
        body: JSON.stringify({
          error: {
            message: 'Internal server error',
            type: 'internal_server_error',
          },
          generationId: 'gen_500_STREAM',
        }),
      };

      const model = createModel();
      try {
        await model.doStream({
          inputFormat: 'messages',
          mode: { type: 'regular' },
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(GatewayInternalServerError);
        expect(error.message).toContain('[gen_500_STREAM]');
        expect(error.generationId).toBe('gen_500_STREAM');
      }
    });
  });

  // ============== 429 Rate Limit ==============
  describe('429 Rate Limit', () => {
    it('doGenerate - shows generationId in error message', async () => {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'error',
        status: 429,
        body: JSON.stringify({
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_exceeded',
          },
          generationId: 'gen_429_GENERATE',
        }),
      };

      const model = createModel();
      try {
        await model.doGenerate({
          inputFormat: 'messages',
          mode: { type: 'regular' },
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(GatewayRateLimitError);
        expect(error.message).toContain('[gen_429_GENERATE]');
        expect(error.generationId).toBe('gen_429_GENERATE');
      }
    });

    it('doStream - shows generationId in error message', async () => {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'error',
        status: 429,
        body: JSON.stringify({
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_exceeded',
          },
          generationId: 'gen_429_STREAM',
        }),
      };

      const model = createModel();
      try {
        await model.doStream({
          inputFormat: 'messages',
          mode: { type: 'regular' },
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(GatewayRateLimitError);
        expect(error.message).toContain('[gen_429_STREAM]');
        expect(error.generationId).toBe('gen_429_STREAM');
      }
    });
  });

  // ============== 498 (custom rate limit) ==============
  describe('498 Rate Limit (custom)', () => {
    it('doGenerate - shows generationId in error message', async () => {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'error',
        status: 498,
        body: JSON.stringify({
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_exceeded',
          },
          generationId: 'gen_498_GENERATE',
        }),
      };

      const model = createModel();
      try {
        await model.doGenerate({
          inputFormat: 'messages',
          mode: { type: 'regular' },
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(GatewayRateLimitError);
        expect(error.message).toContain('[gen_498_GENERATE]');
        expect(error.generationId).toBe('gen_498_GENERATE');
      }
    });

    it('doStream - shows generationId in error message', async () => {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'error',
        status: 498,
        body: JSON.stringify({
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_exceeded',
          },
          generationId: 'gen_498_STREAM',
        }),
      };

      const model = createModel();
      try {
        await model.doStream({
          inputFormat: 'messages',
          mode: { type: 'regular' },
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(GatewayRateLimitError);
        expect(error.message).toContain('[gen_498_STREAM]');
        expect(error.generationId).toBe('gen_498_STREAM');
      }
    });
  });

  // ============== 503 Service Unavailable (capacity error) ==============
  describe('503 Service Unavailable (capacity error)', () => {
    it('doGenerate - shows generationId in error message', async () => {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'error',
        status: 503,
        body: JSON.stringify({
          error: {
            message: 'Service temporarily unavailable. Please try again shortly.',
            type: 'internal_server_error',
          },
          generationId: 'gen_503_GENERATE',
        }),
      };

      const model = createModel();
      try {
        await model.doGenerate({
          inputFormat: 'messages',
          mode: { type: 'regular' },
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(GatewayInternalServerError);
        expect(error.message).toContain('[gen_503_GENERATE]');
        expect(error.generationId).toBe('gen_503_GENERATE');
      }
    });

    it('doStream - shows generationId in error message', async () => {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'error',
        status: 503,
        body: JSON.stringify({
          error: {
            message: 'Service temporarily unavailable. Please try again shortly.',
            type: 'internal_server_error',
          },
          generationId: 'gen_503_STREAM',
        }),
      };

      const model = createModel();
      try {
        await model.doStream({
          inputFormat: 'messages',
          mode: { type: 'regular' },
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(GatewayInternalServerError);
        expect(error.message).toContain('[gen_503_STREAM]');
        expect(error.generationId).toBe('gen_503_STREAM');
      }
    });
  });
});
