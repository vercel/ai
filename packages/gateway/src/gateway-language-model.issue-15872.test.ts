import { readFileSync } from 'node:fs';
import { APICallError, type LanguageModelV3Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { GatewayModelNotFoundError } from './errors';
import { GatewayLanguageModel } from './gateway-language-model';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'test' }] },
];

describe('issue #15872', () => {
  it('includes gateway failure details in the nested APICallError message', async () => {
    const responseBody = readFileSync(
      new URL(
        './__fixtures__/issue-15872-live-error-response.json',
        import.meta.url,
      ),
      'utf8',
    );

    const model = new GatewayLanguageModel('invalid-provider/invalid-model', {
      provider: 'gateway',
      baseURL: 'https://gateway.test/v3/ai',
      headers: () => ({
        Authorization: 'Bearer test-api-key',
        'ai-gateway-auth-method': 'api-key',
      }),
      fetch: async () =>
        new Response(responseBody, {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      o11yHeaders: {},
    });

    try {
      await model.doGenerate({ prompt: TEST_PROMPT });
      expect.unreachable('Expected gateway request to fail');
    } catch (error) {
      expect(GatewayModelNotFoundError.isInstance(error)).toBe(true);
      expect(
        APICallError.isInstance(
          GatewayModelNotFoundError.isInstance(error) ? error.cause : undefined,
        ),
      ).toBe(true);

      if (
        !GatewayModelNotFoundError.isInstance(error) ||
        !APICallError.isInstance(error.cause)
      ) {
        return;
      }

      expect(error.cause.message).toContain(
        "Model 'invalid-provider/invalid-model' not found",
      );
    }
  });
});
