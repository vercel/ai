import type {
  Experimental_RealtimeModelV4 as RealtimeModelV4,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
} from '@ai-sdk/provider';
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
      | 'getHealthCheckResponse'
      | 'createServerEventParser'
      | 'doCreateClientSecret'
      | 'getWebSocketConfig'
    >
  >();
});

it('keeps the existing OpenAI realtime factory assignable', () => {
  expectTypeOf(
    openai.experimental_realtime('gpt-realtime'),
  ).toMatchTypeOf<RealtimeModelV4>();
});

it('accepts Live as a realtime model while retaining its continuous capabilities', () => {
  const model = openai.experimental_live('gpt-live');

  expectTypeOf(model).toMatchTypeOf<RealtimeModelV4>();
  expectTypeOf(model.capabilities.conversation).toEqualTypeOf<'continuous'>();
  expectTypeOf(model.capabilities.transports).toEqualTypeOf<
    readonly ['websocket']
  >();
  expectTypeOf(model.getServerWebSocketConfig()).toEqualTypeOf<{
    url: string;
    headers: Record<string, string>;
  }>();
  expectTypeOf(model.createServerEventParser()).toEqualTypeOf<
    (raw: unknown) => RealtimeModelV4ServerEvent[]
  >();
  expectTypeOf(model.capabilities.connections).toEqualTypeOf<
    readonly ['server-websocket']
  >();
  expectTypeOf(model.capabilities.startup).toEqualTypeOf<'session-start'>();
  expectTypeOf(
    model.capabilities.finalization,
  ).toEqualTypeOf<'session-close'>();
});
