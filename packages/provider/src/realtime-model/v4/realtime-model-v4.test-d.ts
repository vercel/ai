import { expectTypeOf, it } from 'vitest';
import type { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';
import type { RealtimeModelV4 } from './realtime-model-v4';
import type { RealtimeModelV4ClientEvent } from './realtime-model-v4-client-event';
import type { RealtimeModelV4ServerEvent } from './realtime-model-v4-server-event';

it('makes token methods optional without requiring new capability fields', () => {
  expectTypeOf<{}>().toMatchTypeOf<
    Pick<RealtimeModelV4, 'doCreateClientSecret' | 'getWebSocketConfig'>
  >();
  const minimal = {
    specificationVersion: 'v4',
    provider: 'minimal',
    modelId: 'minimal',
    capabilities: { conversation: 'turn-based', transports: ['websocket'] },
    parseServerEvent: raw => ({ type: 'custom', rawType: 'custom', raw }),
    serializeClientEvent: () => null,
    buildSessionConfig: () => ({}),
  } satisfies RealtimeModelV4;
  expectTypeOf(minimal).toMatchTypeOf<RealtimeModelV4>();
});

it('keeps mute and unmute individually extractable', () => {
  expectTypeOf<
    Extract<RealtimeModelV4ClientEvent, { type: 'input-audio-mute' }>
  >().toEqualTypeOf<{ type: 'input-audio-mute'; eventId?: string }>();
  expectTypeOf<
    Extract<RealtimeModelV4ClientEvent, { type: 'input-audio-unmute' }>
  >().toEqualTypeOf<{ type: 'input-audio-unmute'; eventId?: string }>();
});

it('keeps provider-specific context and image options outside the shared fields', () => {
  type Context = Extract<
    RealtimeModelV4ClientEvent,
    { type: 'context-append' }
  >;
  type Image = Extract<
    Extract<
      RealtimeModelV4ClientEvent,
      { type: 'backend-input-create' }
    >['content'][number],
    { type: 'image' }
  >;
  expectTypeOf<'channel'>().not.toMatchTypeOf<keyof Context>();
  expectTypeOf<'detail'>().not.toMatchTypeOf<keyof Image>();
  expectTypeOf<Context['providerOptions']>().toEqualTypeOf<
    SharedV4ProviderOptions | undefined
  >();
  expectTypeOf<Image['providerOptions']>().toEqualTypeOf<
    SharedV4ProviderOptions | undefined
  >();
  expectTypeOf<
    Extract<
      RealtimeModelV4ServerEvent,
      { type: 'session-started' }
    >['delegationMode']
  >().toEqualTypeOf<'client' | 'provider' | undefined>();
  expectTypeOf<
    Extract<
      RealtimeModelV4ServerEvent,
      { type: 'delegation-created' }
    >['target']
  >().toEqualTypeOf<'client' | 'provider' | undefined>();
});
