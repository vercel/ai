import type { Context } from '@ai-sdk/provider-utils';
import { createTelemetryDispatcher } from '../telemetry/create-telemetry-dispatcher';
import { filterIncludedContext } from '../telemetry/filter-included-context';
import type { TelemetryDispatcher } from '../telemetry/telemetry';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { Callback } from '../util/callback';
import type { DecideEndEvent, DecideStartEvent } from './decide-events';

export function createRestrictedTelemetryDispatcher<
  RUNTIME_CONTEXT extends Context,
>({
  telemetry,
}: {
  telemetry?: TelemetryOptions<RUNTIME_CONTEXT>;
}): Omit<
  TelemetryDispatcher,
  | 'onStart'
  | 'onEnd'
  | 'experimental_onDecideStart'
  | 'experimental_onDecideEnd'
> & {
  onStart: Callback<DecideStartEvent<RUNTIME_CONTEXT>>;
  onEnd: Callback<DecideEndEvent<RUNTIME_CONTEXT>>;
} {
  const dispatcher = createTelemetryDispatcher({ telemetry });

  return {
    ...dispatcher,
    onStart: event =>
      dispatcher.experimental_onDecideStart?.({
        ...event,
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: telemetry?.includeRuntimeContext,
        }),
      }),
    onEnd: event =>
      dispatcher.experimental_onDecideEnd?.({
        ...event,
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: telemetry?.includeRuntimeContext,
        }),
      }),
  };
}
