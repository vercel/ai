import type { Experimental_RealtimeModelV4 as RealtimeModelV4 } from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { openai } from '../index';

it('accepts an existing minimal implementer without transport extensions', () => {
  const model = {
    specificationVersion: 'v4',
    provider: 'minimal',
    modelId: 'minimal',
    doCreateClientSecret: async () => ({
      token: 'token',
      url: 'wss://example.com/realtime',
    }),
    getWebSocketConfig: ({ url }) => ({ url }),
    parseServerEvent: raw => ({ type: 'custom', rawType: 'custom', raw }),
    serializeClientEvent: () => null,
    buildSessionConfig: () => ({}),
  } satisfies RealtimeModelV4;

  expectTypeOf(model).toMatchTypeOf<RealtimeModelV4>();
  expectTypeOf<{}>().toMatchTypeOf<
    Pick<
      RealtimeModelV4,
      | 'capabilities'
      | 'getServerWebSocketConfig'
      | 'doCreateWebRTCSession'
      | 'getHealthCheckResponse'
      | 'getWebRTCConfig'
      | 'createServerEventParser'
    >
  >();
});

it('keeps the existing OpenAI realtime factory assignable', () => {
  expectTypeOf(
    openai.experimental_realtime('gpt-realtime'),
  ).toMatchTypeOf<RealtimeModelV4>();
});

it('accepts Live as a realtime model while retaining its continuous capabilities', () => {
  const model = openai.live('gpt-live');

  expectTypeOf(model).toMatchTypeOf<RealtimeModelV4>();
  expectTypeOf(model.capabilities.conversation).toEqualTypeOf<'continuous'>();
  expectTypeOf(model.capabilities.transports).toEqualTypeOf<
    readonly ['websocket', 'webrtc']
  >();
  expectTypeOf(model.getServerWebSocketConfig()).toEqualTypeOf<{
    url: string;
    headers: Record<string, string>;
  }>();
  expectTypeOf(model.getWebRTCConfig()).toEqualTypeOf<{
    dataChannelLabel: string;
  }>();
  expectTypeOf(model.createServerEventParser()).toEqualTypeOf<
    RealtimeModelV4['parseServerEvent']
  >();
  expectTypeOf(
    model.doCreateWebRTCSession({ sdp: 'offer' }),
  ).resolves.toEqualTypeOf<{ sessionId: string; sdp: string }>();
});
