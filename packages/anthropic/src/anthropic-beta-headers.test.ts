import { describe, expect, it } from 'vitest';
import { AnthropicLanguageModel } from './anthropic-language-model';
import {
  createAnthropic,
  type AnthropicProviderSettings,
} from './anthropic-provider';

const headerNames = ['anthropic-beta', 'Anthropic-Beta', 'ANTHROPIC-BETA'];
const cases = headerNames.flatMap(configHeader =>
  headerNames.flatMap(requestHeader =>
    (['generate', 'stream'] as const).flatMap(method =>
      [false, true].map(dynamicConfig => ({
        configHeader,
        requestHeader,
        method,
        dynamicConfig,
      })),
    ),
  ),
);

describe('Anthropic beta header casing', () => {
  it.each(cases)(
    'preserves betas with $configHeader / $requestHeader via $method (dynamic config: $dynamicConfig)',
    async ({ configHeader, requestHeader, method, dynamicConfig }) => {
      let requestHeaders: Headers | undefined;
      let headerResolutionCount = 0;
      let headerTransformCount = 0;
      const settings: AnthropicProviderSettings = {
        apiKey: 'synthetic-test-key',
        headers: {
          [configHeader]: 'CONFIG-beta,shared-beta',
          'x-remove': 'remove-me',
        },
        fetch: async (_url, init) => {
          requestHeaders = new Headers(init?.headers);

          if (method === 'generate') {
            return Response.json({
              type: 'message',
              id: 'synthetic-message',
              model: 'claude-3-haiku-20240307',
              content: [{ type: 'text', text: 'Synthetic response.' }],
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 1 },
            });
          }

          const events = [
            {
              type: 'message_start',
              message: {
                id: 'synthetic-message',
                model: 'claude-3-haiku-20240307',
                role: 'assistant',
                content: [],
                usage: { input_tokens: 1, output_tokens: 0 },
              },
            },
            {
              type: 'message_delta',
              delta: { stop_reason: 'end_turn', stop_sequence: null },
              usage: { output_tokens: 0 },
            },
            { type: 'message_stop' },
          ];
          return new Response(
            events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
            { headers: { 'content-type': 'text/event-stream' } },
          );
        },
      };

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Synthetic prompt.' }],
          },
        ],
        headers: {
          [requestHeader]: ' REQUEST-beta , shared-beta ',
          'x-remove': undefined,
        },
        providerOptions: { anthropic: { anthropicBeta: ['option-beta'] } },
      };
      const model = dynamicConfig
        ? new AnthropicLanguageModel('claude-3-haiku-20240307', {
            provider: 'anthropic.messages',
            baseURL: 'https://api.anthropic.com/v1',
            headers: async () => {
              headerResolutionCount++;
              return {
                ...settings.headers,
                'x-config-resolution': String(headerResolutionCount),
              };
            },
            fetch: settings.fetch,
            transformRequestHeaders: headers => {
              headerTransformCount++;
              expect(
                Object.keys(headers).filter(
                  name => name.toLowerCase() === 'anthropic-beta',
                ),
              ).toEqual(['anthropic-beta']);
              expect(headers['anthropic-beta']?.split(',').sort()).toEqual([
                'config-beta',
                'option-beta',
                'request-beta',
                'shared-beta',
              ]);
              return { ...headers, 'x-transformed': 'yes' };
            },
          })
        : createAnthropic(settings)('claude-3-haiku-20240307');

      if (method === 'generate') {
        await model.doGenerate(options);
      } else {
        const { stream } = await model.doStream(options);
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            expect(value.type).not.toBe('error');
          }
        } finally {
          reader.releaseLock();
        }
      }

      expect(requestHeaders?.get('anthropic-beta')?.split(',').sort()).toEqual([
        'config-beta',
        'option-beta',
        'request-beta',
        'shared-beta',
      ]);
      expect(requestHeaders?.has('x-remove')).toBe(false);
      if (dynamicConfig) {
        expect(headerResolutionCount).toBe(1);
        expect(headerTransformCount).toBe(1);
        expect(requestHeaders?.get('x-transformed')).toBe('yes');
        expect(requestHeaders?.get('x-config-resolution')).toBe('1');
      }
    },
  );
});
