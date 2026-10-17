import { expectTypeOf } from 'vitest';
import type { Experimental_RealtimeSessionOptions } from '../index';

expectTypeOf<Experimental_RealtimeSessionOptions['playback']>().toEqualTypeOf<
  boolean | { getPositionMs: () => number } | undefined
>();

declare const options: Experimental_RealtimeSessionOptions;

if (options.playback != null && typeof options.playback === 'object') {
  expectTypeOf(options.playback.getPositionMs).toEqualTypeOf<() => number>();
}
