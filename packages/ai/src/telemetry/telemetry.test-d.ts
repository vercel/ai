import { describe, expectTypeOf, it } from 'vitest';
import type { Telemetry, TelemetryDispatcher } from './telemetry';

describe('telemetry error events', () => {
  it('exposes a callId and an unknown thrown value to integrations', () => {
    type Event = Parameters<NonNullable<Telemetry['onError']>>[0];
    expectTypeOf<Event['callId']>().toEqualTypeOf<string>();
    expectTypeOf<Event['error']>().toEqualTypeOf<unknown>();
  });

  it('requires the error envelope when dispatching', () => {
    const dispatcher = {} as TelemetryDispatcher;
    dispatcher.onError?.({ callId: 'call-1', error: new Error('failed') });
    // @ts-expect-error A bare error cannot identify the failed operation.
    dispatcher.onError?.(new Error('failed'));
    // @ts-expect-error A thrown value alone is not an error event.
    dispatcher.onError?.('failed');
  });
});
