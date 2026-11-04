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

function events(value: Record<string, unknown>) {
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

describe('Anthropic service-tier response metadata', () => {
  const server = createTestServer({ [url]: {} });
  const model = createAnthropic({ apiKey: 'test' })('claude-haiku-4-5');

  it.each(['generate', 'stream'] as const)(
    'reads the applied tier from usage in %s',
    async mode => {
      const response = {
        ...message,
        service_tier: 'top-level',
        usage: { ...message.usage, service_tier: 'priority' },
      };
      server.urls[url].response =
        mode === 'generate'
          ? { type: 'json-value', body: response }
          : { type: 'stream-chunks', chunks: events(response) };
      const metadata =
        mode === 'generate'
          ? (await model.doGenerate(options)).providerMetadata
          : (
              await convertReadableStreamToArray(
                (
                  await model.doStream(options)
                ).stream,
              )
            ).find(part => part.type === 'finish')?.providerMetadata;
      expect(metadata?.anthropic?.serviceTier).toBe('priority');
    },
  );

  it.each(['generate', 'stream'] as const)(
    'retains top-level compatible-provider metadata in %s',
    async mode => {
      const response = { ...message, service_tier: 'standard' };
      server.urls[url].response =
        mode === 'generate'
          ? { type: 'json-value', body: response }
          : { type: 'stream-chunks', chunks: events(response) };
      const metadata =
        mode === 'generate'
          ? (await model.doGenerate(options)).providerMetadata
          : (
              await convertReadableStreamToArray(
                (
                  await model.doStream(options)
                ).stream,
              )
            ).find(part => part.type === 'finish')?.providerMetadata;
      expect(metadata?.anthropic?.serviceTier).toBe('standard');
    },
  );

  it('does not retain a previous message tier when the next message omits it', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        ...events({
          ...message,
          usage: { ...message.usage, service_tier: 'standard' },
        }),
        ...events({ ...message, id: 'msg_second' }),
      ],
    };
    const parts = await convertReadableStreamToArray(
      (await model.doStream(options)).stream,
    );
    const finished = parts.filter(part => part.type === 'finish');
    expect(
      finished.map(part => part.providerMetadata?.anthropic?.serviceTier),
    ).toEqual(['standard', undefined]);
  });

  it('uses a final usage update when the service tier arrives in a delta', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        { type: 'message_start', message },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 1, service_tier: 'priority' },
        },
        { type: 'message_stop' },
      ].map(event => `data: ${JSON.stringify(event)}\n\n`),
    };
    const parts = await convertReadableStreamToArray(
      (await model.doStream(options)).stream,
    );
    expect(
      parts.find(part => part.type === 'finish')?.providerMetadata?.anthropic
        ?.serviceTier,
    ).toBe('priority');
  });
});
