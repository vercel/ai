import type { MouseEventHandler } from 'react';
import { expectTypeOf } from 'vitest';
import type { Experimental_RealtimeSessionState } from 'ai';
import type {
  Experimental_UseRealtimeOptions,
  Experimental_UseRealtimeReturn,
} from './use-realtime';

declare const realtime: Experimental_UseRealtimeReturn;

expectTypeOf<{ session: string }>().toExtend<
  Experimental_UseRealtimeOptions['api']
>();
expectTypeOf<{ session: string; token: string }>().not.toExtend<
  Experimental_UseRealtimeOptions['api']
>();
expectTypeOf<{ session: string; websocket: string }>().not.toExtend<
  Experimental_UseRealtimeOptions['api']
>();
expectTypeOf<{ session: string; protocols: string[] }>().not.toExtend<
  Experimental_UseRealtimeOptions['api']
>();
expectTypeOf<
  Experimental_UseRealtimeOptions['rtcDisconnectTimeoutMs']
>().toEqualTypeOf<number | undefined>();

expectTypeOf(realtime.session).toEqualTypeOf<
  Experimental_RealtimeSessionState | undefined
>();
expectTypeOf(realtime.connect).toExtend<MouseEventHandler<HTMLButtonElement>>();
expectTypeOf(realtime.resumeAudioCapture).toEqualTypeOf<() => Promise<void>>();
expectTypeOf(realtime.sendEvent).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(realtime.close).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(realtime.disconnect).toEqualTypeOf<() => void>();
realtime.connect();
realtime.connect({ capture: false });
realtime.sendEvent({
  type: 'context-append',
  delegationId: null,
  content: 'context',
  providerOptions: { custom: { priority: 1 } },
});
// @ts-expect-error Session metadata uses the neutral session name.
realtime.live;
