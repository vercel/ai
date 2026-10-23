import { describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const headerNames = ['anthropic-beta', 'Anthropic-Beta', 'ANTHROPIC-BETA'];
const cases = headerNames.flatMap(configHeader =>
  headerNames.flatMap(requestHeader =>
    (['generate', 'stream'] as const).map(method => ({
      configHeader,
      requestHeader,
      method,
    })),
  ),
);

describe('Anthropic beta header casing', () => {
  it.each(cases)(
    'preserves config, request, and option betas with $configHeader / $requestHeader via $method',
    async ({ configHeader, requestHeader, method }) => {
      let requestHeaders: Headers | undefined;
      const provider = createAnthropic({
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
      });

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
      const model = provider('claude-3-haiku-20240307');

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
    },
  );
});
