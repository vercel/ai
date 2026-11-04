import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const url = 'https://api.anthropic.com/v1/messages';
const options = {
  prompt: [
    { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hi' }] },
  ],
  maxOutputTokens: 16,
};

const message = {
  id: 'msg_tier',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-4-5',
  content: [],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1, output_tokens: 1 },
};

function events(value: typeof message) {
  return [
    { type: 'message_start', message: value },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`);
}

describe('Anthropic service tiers', () => {
  const server = createTestServer({ [url]: {} });
  const model = createAnthropic({ apiKey: 'test' })('claude-haiku-4-5');

  it.each(['generate', 'stream'] as const)(
    'sends the tier when using %s',
    async mode => {
      server.urls[url].response =
        mode === 'generate'
          ? { type: 'json-value', body: message }
          : { type: 'stream-chunks', chunks: events(message) };
      const callOptions = {
        ...options,
        providerOptions: { anthropic: { serviceTier: 'standard_only' } },
      };
      if (mode === 'generate') await model.doGenerate(callOptions);
      else
        await convertReadableStreamToArray(
          (await model.doStream(callOptions)).stream,
        );
      expect(await server.calls[0].requestBodyJson).toMatchObject({
        service_tier: 'standard_only',
      });
    },
  );

  it('warns and omits a MiniMax-only tier', async () => {
    server.urls[url].response = { type: 'json-value', body: message };
    const result = await model.doGenerate({
      ...options,
      providerOptions: { anthropic: { serviceTier: 'priority' } },
    });
    expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
      'service_tier',
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'unsupported', feature: 'serviceTier' }),
    );
  });
});
