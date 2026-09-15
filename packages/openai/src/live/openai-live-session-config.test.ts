import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAI } from '../index';
import { openaiRealtimeModelLiveOptionsSchema } from './openai-realtime-model-live-options';
import { buildOpenAILiveSessionConfig } from './openai-live-session-config';

const model = createOpenAI().experimental_realtime('gpt-live-1');

describe('Live client delegation startup options', () => {
  it('converts native RTC permissions without enabling a managed response backend', () => {
    const client = {
      dataChannel: {
        allowedClientEvents: ['session.close', 'session.thinking.append'],
        allowedServerEvents: [
          { type: 'session.started' },
          { type: 'session.closed' },
          { type: 'response.event', responseEvent: 'response.completed' },
        ],
      },
    };
    const config = {
      providerOptions: { openai: { delegation: { type: 'client' }, client } },
    };
    expect(
      buildOpenAILiveSessionConfig(config, 'gpt-live-1', 'webrtc'),
    ).toEqual({
      model: 'gpt-live-1',
      audio: { output: { voice: 'marin' } },
      delegation: { type: 'client' },
      client: {
        data_channel: {
          allowed_client_events: ['session.close', 'session.thinking.append'],
          allowed_server_events: [
            { type: 'session.started' },
            { type: 'session.closed' },
            { type: 'response.event', response_event: 'response.completed' },
          ],
        },
      },
    });
    expect(() => model.buildSessionConfig(config)).toThrow(
      UnsupportedFunctionalityError,
    );
  });

  it.each([
    [{}, {}],
    [
      { allowedClientEvents: 'all', allowedServerEvents: 'all' },
      { allowed_client_events: 'all', allowed_server_events: 'all' },
    ],
    [
      { allowedClientEvents: [], allowedServerEvents: [] },
      { allowed_client_events: [], allowed_server_events: [] },
    ],
  ])(
    'preserves omitted, all, and empty RTC permissions: %j',
    (dataChannel, expected) => {
      expect(
        buildOpenAILiveSessionConfig(
          { providerOptions: { openai: { client: { dataChannel } } } },
          'gpt-live-1',
          'webrtc',
        ),
      ).toMatchObject({ client: { data_channel: expected } });
    },
  );

  it.each([
    { allowedServerEvents: ['session.started'] },
    { allowedServerEvents: [{ type: 'response.event' }] },
    {
      allowedServerEvents: [
        { type: 'session.started', responseEvent: 'response.created' },
      ],
    },
    {
      allowedServerEvents: [
        { type: 'response.event', response_event: 'response.created' },
      ],
    },
    { allowedClientEvents: true },
    { extra: [] },
  ])('rejects malformed RTC selectors %j', dataChannel => {
    expect(() =>
      buildOpenAILiveSessionConfig(
        { providerOptions: { openai: { client: { dataChannel } } } },
        'gpt-live-1',
        'webrtc',
      ),
    ).toThrow();
  });

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
