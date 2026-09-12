import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAI } from '../index';
import {
  openaiRealtimeModelLiveOptionsSchema,
  openaiRealtimeModelLiveUpdateOptionsSchema,
} from './openai-realtime-model-live-options';

const model = createOpenAI().experimental_live('gpt-live-1');

describe('Live startup and update options', () => {
  it('requires the backend model only at startup and supplies the update discriminator', () => {
    const options = { delegation: { responses: { instructions: '' } } };
    expect(
      openaiRealtimeModelLiveOptionsSchema.safeParse({
        delegation: { type: 'responses', responses: {} },
      }).success,
    ).toBe(false);
    expect(openaiRealtimeModelLiveUpdateOptionsSchema.parse(options)).toEqual(
      options,
    );
    expect(
      model.serializeClientEvent({
        type: 'session-update',
        eventId: 'update-1',
        config: { providerOptions: { openai: options } },
      }),
    ).toEqual({
      type: 'session.update',
      event_id: 'update-1',
      session: {
        delegation: { type: 'responses', responses: { instructions: '' } },
      },
    });
  });

  it.each([
    {
      instructions: '',
      maxOutputTokens: 64,
      parallelToolCalls: false,
      serviceTier: 'priority',
    },
    {
      instructions: null,
      maxOutputTokens: null,
      parallelToolCalls: null,
      serviceTier: null,
      reasoning: null,
      text: null,
    },
    { reasoning: { effort: null, summary: null }, text: { verbosity: null } },
    { instructions: '', parallelToolCalls: false, tools: [] },
    { tools: [{ type: 'function', name: 'ping' }] },
    {
      tools: [
        {
          type: 'function',
          name: 'ping',
          description: null,
          strict: null,
          parameters: null,
        },
      ],
    },
  ])(
    'preserves nullable and empty backend options at both boundaries: %j',
    responses => {
      const wire = Object.fromEntries(
        Object.entries(responses).map(([key, value]) => [
          (
            {
              maxOutputTokens: 'max_output_tokens',
              parallelToolCalls: 'parallel_tool_calls',
              serviceTier: 'service_tier',
            } as Record<string, string>
          )[key] ?? key,
          value,
        ]),
      );
      expect(
        model.buildSessionConfig({
          providerOptions: {
            openai: {
              delegation: {
                type: 'responses',
                responses: { model: 'backend', ...responses },
              },
            },
          },
        }),
      ).toMatchObject({
        delegation: {
          type: 'responses',
          responses: { model: 'backend', ...wire },
        },
      });
      expect(
        model.serializeClientEvent({
          type: 'session-update',
          config: {
            providerOptions: { openai: { delegation: { responses } } },
          },
        }),
      ).toEqual({
        type: 'session.update',
        session: { delegation: { type: 'responses', responses: wire } },
      });
    },
  );

  it.each([
    { client: { dataChannel: {} } },
    { store: false },
    { input: [] },
    { voice: { id: 'voice' } },
    { model: 'replacement' },
    { instructions: '' },
    { audio: { output: { voice: 'marin' } } },
  ])(
    'rejects immutable update fields even alongside valid changes: %j',
    immutable => {
      expect(() =>
        model.serializeClientEvent({
          type: 'session-update',
          config: {
            providerOptions: {
              openai: { delegation: { responses: {} }, ...immutable },
            },
          },
        }),
      ).toThrow();
    },
  );

  it('defaults context to thinking and validates OpenAI command and image options', () => {
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
    expect(() =>
      model.serializeClientEvent({
        type: 'backend-input-create',
        content: [
          {
            type: 'image',
            url: 'https://example.com/image.png',
            providerOptions: { openai: { imageDetail: 'invalid' } },
          },
        ],
      }),
    ).toThrow();
  });
});

describe('Live WebRTC client permissions', () => {
  it.each([
    [undefined, undefined],
    [{ dataChannel: {} }, { data_channel: {} }],
    [
      { dataChannel: { allowedClientEvents: [] } },
      { data_channel: { allowed_client_events: [] } },
    ],
    [
      { dataChannel: { allowedServerEvents: [] } },
      { data_channel: { allowed_server_events: [] } },
    ],
    [
      {
        dataChannel: { allowedClientEvents: 'all', allowedServerEvents: 'all' },
      },
      {
        data_channel: {
          allowed_client_events: 'all',
          allowed_server_events: 'all',
        },
      },
    ],
    [
      { dataChannel: { allowedClientEvents: [], allowedServerEvents: [] } },
      {
        data_channel: { allowed_client_events: [], allowed_server_events: [] },
      },
    ],
    [
      {
        dataChannel: {
          allowedClientEvents: [
            'session.input_audio.mute',
            'future.client.event',
          ],
          allowedServerEvents: [
            { type: 'session.output_transcript.delta' },
            {
              type: 'response.event',
              responseEvent: 'response.output_text.delta',
            },
          ],
        },
      },
      {
        data_channel: {
          allowed_client_events: [
            'session.input_audio.mute',
            'future.client.event',
          ],
          allowed_server_events: [
            { type: 'session.output_transcript.delta' },
            {
              type: 'response.event',
              response_event: 'response.output_text.delta',
            },
          ],
        },
      },
    ],
  ])('preserves the exact frontend policy %j', async (client, expected) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        session: { id: 'session-1' },
        transport: { type: 'webrtc', sdp: 'answer' },
      }),
    );
    await createOpenAI({ apiKey: 'test-key', fetch })
      .experimental_live('gpt-live-1')
      .doCreateWebRTCSession({
        sdp: 'offer',
        sessionConfig: {
          providerOptions: { openai: client === undefined ? {} : { client } },
        },
      });
    const session = JSON.parse(fetch.mock.calls[0][1]?.body as string).session;
    if (expected === undefined) expect(session).not.toHaveProperty('client');
    else expect(session.client).toEqual(expected);
  });

  it.each([
    ['session.started'],
    [{ type: 'response.event' }],
    [{ type: 'session.started', responseEvent: 'response.created' }],
    [{ type: 'response.event', responseEvent: null }],
    [{ type: 'response.event', response_event: 'response.created' }],
  ])(
    'rejects invalid server selectors before sending a request: %j',
    async selector => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      await expect(
        createOpenAI({ apiKey: 'test-key', fetch })
          .experimental_live('gpt-live-1')
          .doCreateWebRTCSession({
            sdp: 'offer',
            sessionConfig: {
              providerOptions: {
                openai: {
                  client: { dataChannel: { allowedServerEvents: [selector] } },
                },
              },
            },
          }),
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([{}, { allowedClientEvents: 'all' }, { allowedClientEvents: [] }])(
    'rejects permissions on primary WebSocket startup and updates: %j',
    dataChannel => {
      const config = {
        providerOptions: { openai: { client: { dataChannel } } },
      };
      expect(() => model.buildSessionConfig(config)).toThrow(
        UnsupportedFunctionalityError,
      );
      expect(() =>
        model.serializeClientEvent({ type: 'session-start', config }),
      ).toThrow(UnsupportedFunctionalityError);
      expect(() =>
        model.serializeClientEvent({ type: 'session-update', config }),
      ).toThrow();
    },
  );
});
