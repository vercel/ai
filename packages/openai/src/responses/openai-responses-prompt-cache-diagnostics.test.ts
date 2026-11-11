import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const url = 'https://api.openai.com/v1/responses';

describe.each(['generate', 'stream'] as const)(
  'Responses cache diagnostics (%s)',
  method => {
    const server = createTestServer({ [url]: {} });
    it.each([
      {
        type: 'cache_miss',
        reason: 'text_format_changed',
        cache_missed_tokens: 1200,
        comparison_reusable_tokens: 1500,
      },
      { type: 'cache_hit' },
      { type: 'comparison_response_not_found' },
      { type: 'unavailable' },
      { type: 'future_diagnostic', reason: 'future_reason' },
      null,
      undefined,
    ])('forwards comparison requests and returns %j', async diagnostics => {
      const response = {
        id: 'resp_test',
        created_at: 0,
        model: 'gpt-6-astra',
        output: [],
        usage: { input_tokens: 0, output_tokens: 0 },
        prompt_cache_diagnostics: diagnostics,
      };
      server.urls[url].response =
        method === 'generate'
          ? { type: 'json-value', body: response }
          : {
              type: 'stream-chunks',
              chunks: [
                `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
              ],
            };
      const model = new OpenAIResponsesLanguageModel('gpt-6-astra', {
        provider: 'openai.responses',
        url: () => url,
        headers: () => ({}),
      });
      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Hello' }],
          },
        ],
        providerOptions: {
          openai: {
            promptCacheOptions: {
              mode: 'implicit',
              ttl: '30m',
              comparisonResponseId: 'resp_baseline',
            },
          },
        },
      };
      const metadata =
        method === 'generate'
          ? (await model.doGenerate(options)).providerMetadata
          : (
              await convertReadableStreamToArray(
                (
                  await model.doStream(options)
                ).stream,
              )
            ).find(part => part.type === 'finish')!.providerMetadata;
      expect(
        (await server.calls[0].requestBodyJson).prompt_cache_options,
      ).toEqual({
        mode: 'implicit',
        ttl: '30m',
        comparison_response_id: 'resp_baseline',
      });
      if (diagnostics == null)
        expect(metadata?.openai).not.toHaveProperty('promptCacheDiagnostics');
      else
        expect(metadata?.openai?.promptCacheDiagnostics).toEqual(diagnostics);
    });
  },
);
