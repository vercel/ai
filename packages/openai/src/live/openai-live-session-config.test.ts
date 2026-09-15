import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAI } from '../index';
import { openaiRealtimeModelLiveOptionsSchema } from './openai-realtime-model-live-options';

const model = createOpenAI().experimental_realtime('gpt-live-1');

describe('Live client delegation startup options', () => {
  it.each([{}, { delegation: null }, { delegation: { type: 'client' } }])(
    'accepts client startup options %j',
    options => {
      expect(openaiRealtimeModelLiveOptionsSchema.parse(options)).toEqual(
        options,
      );
      expect(
        model.serializeClientEvent({
          type: 'session-start',
          config: { providerOptions: { openai: options } },
        }),
      ).toMatchObject({ type: 'session.start', session: options });
    },
  );

  it.each([
    { type: 'responses' },
    { type: 'responses', responses: { model: 'test-model' } },
  ])('rejects Responses delegation before a socket send: %j', delegation => {
    const config = { providerOptions: { openai: { delegation } } };
    const send = vi.fn();
    expect(() => model.buildSessionConfig(config)).toThrow(
      UnsupportedFunctionalityError,
    );
    expect(() =>
      send(model.serializeClientEvent({ type: 'session-start', config })),
    ).toThrow(/only client delegation is supported/);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    { client: { dataChannel: {} } },
    { delegation: { type: 'client', client: {} } },
    { delegation: { type: 'client', responses: {} } },
    { tools: [] },
    {
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_image', image_url: 'https://example.com/image.png' },
          ],
        },
      ],
    },
  ])('rejects unsupported startup fields: %j', options => {
    expect(() =>
      model.buildSessionConfig({ providerOptions: { openai: options } }),
    ).toThrow();
  });

  it.each([
    {},
    { instructions: 'new instructions' },
    { providerOptions: { openai: { delegation: { type: 'client' } } } },
    { providerOptions: { openai: { delegation: null } } },
    { providerOptions: { openai: { delegation: { type: 'responses' } } } },
  ])('rejects every Live session update before sending: %j', config => {
    const send = vi.fn();
    expect(() =>
      send(model.serializeClientEvent({ type: 'session-update', config })),
    ).toThrow(/startup settings are immutable; use context-append/);
    expect(send).not.toHaveBeenCalled();
  });

  it('defaults context to thinking and validates OpenAI channel options', () => {
    expect(
      model.serializeClientEvent({
        type: 'context-append',
        content: '',
        delegationId: null,
      }),
    ).toEqual({
      type: 'session.thinking.append',
      content: '',
      delegation_id: null,
    });
    expect(() =>
      model.serializeClientEvent({
        type: 'context-append',
        content: 'context',
        delegationId: null,
        providerOptions: { openai: { channel: 'invalid' } },
      }),
    ).toThrow();
  });
});
