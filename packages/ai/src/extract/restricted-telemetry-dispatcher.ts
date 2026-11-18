import type { Context } from '@ai-sdk/provider-utils';
import { createTelemetryDispatcher } from '../telemetry/create-telemetry-dispatcher';
import { filterIncludedContext } from '../telemetry/filter-included-context';
import type { TelemetryDispatcher } from '../telemetry/telemetry';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { Callback } from '../util/callback';
import type { ExtractEndEvent, ExtractStartEvent } from './extract-events';

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
  | 'experimental_onExtractStart'
  | 'experimental_onExtractEnd'
> & {
  onStart: Callback<ExtractStartEvent<RUNTIME_CONTEXT>>;
  onEnd: Callback<ExtractEndEvent<RUNTIME_CONTEXT>>;
} {
  const dispatcher = createTelemetryDispatcher({ telemetry });

  return {
    ...dispatcher,
    onStart: event =>
      dispatcher.experimental_onExtractStart?.({
        ...event,
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: telemetry?.includeRuntimeContext,
        }),
      }),
    onEnd: event =>
      dispatcher.experimental_onExtractEnd?.({
        ...event,
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: telemetry?.includeRuntimeContext,
        }),
      }),
  };
}
