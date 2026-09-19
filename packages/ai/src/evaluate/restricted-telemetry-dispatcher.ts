import type { Context } from '@ai-sdk/provider-utils';
import { createTelemetryDispatcher } from '../telemetry/create-telemetry-dispatcher';
import { filterIncludedContext } from '../telemetry/filter-included-context';
import type { TelemetryDispatcher } from '../telemetry/telemetry';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { Callback } from '../util/callback';
import type { EvaluateEndEvent, EvaluateStartEvent } from './evaluate-events';

export function createRestrictedTelemetryDispatcher<
  RUNTIME_CONTEXT extends Context,
>({
  telemetry,
}: {
  telemetry?: TelemetryOptions<RUNTIME_CONTEXT>;
}): Omit<TelemetryDispatcher, 'onStart' | 'onEnd'> & {
  onStart: Callback<EvaluateStartEvent<RUNTIME_CONTEXT>>;
  onEnd: Callback<EvaluateEndEvent<RUNTIME_CONTEXT>>;
} {
  const dispatcher = createTelemetryDispatcher({ telemetry });

  return {
    ...dispatcher,
    onStart: event =>
      dispatcher.onStart?.({
        ...event,
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: telemetry?.includeRuntimeContext,
        }),
      }),
    onEnd: event =>
      dispatcher.onEnd?.({
        ...event,
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: telemetry?.includeRuntimeContext,
        }),
      }),
  };
}
