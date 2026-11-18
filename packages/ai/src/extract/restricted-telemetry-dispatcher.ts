import type { Context } from '@ai-sdk/provider-utils';
import { createTelemetryDispatcher } from '../telemetry/create-telemetry-dispatcher';
import { filterIncludedContext } from '../telemetry/filter-included-context';
import type { TelemetryDispatcher } from '../telemetry/telemetry';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { Callback } from '../util/callback';
import type { ExtractEndEvent, ExtractStartEvent } from './extract-events';

export function toTelemetryEvent<
  EVENT extends Pick<
    ExtractStartEvent,
    'headers' | 'providerOptions' | 'state'
  >,
>(event: EVENT): EVENT {
  return {
    ...event,
    headers: undefined,
    providerOptions: {},
    state: redactFileLocations(event.state),
  };
}

function redactFileLocations<STATE>(state: STATE): STATE {
  if (!Array.isArray(state)) return state;
  return state.map(part =>
    part?.type === 'file' && isFileLocation(part.data)
      ? { ...part, data: '[redacted]' }
      : part,
  ) as STATE;
}

function isFileLocation(data: unknown): boolean {
  if (data instanceof URL) return true;
  if (typeof data === 'string') {
    try {
      return new URL(data).protocol !== 'data:';
    } catch {
      return false;
    }
  }
  return (
    data != null &&
    typeof data === 'object' &&
    'type' in data &&
    (data.type === 'url' || data.type === 'reference')
  );
}

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
    experimental_onExtractionModelCallStart: event =>
      dispatcher.experimental_onExtractionModelCallStart?.({
        ...event,
        state: redactFileLocations(event.state),
      }),
    experimental_onExtractionModelCallEnd: event =>
      dispatcher.experimental_onExtractionModelCallEnd?.({
        ...event,
        state: redactFileLocations(event.state),
      }),
    onStart: event =>
      dispatcher.experimental_onExtractStart?.({
        ...toTelemetryEvent(event),
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: telemetry?.includeRuntimeContext,
        }),
      }),
    onEnd: event =>
      dispatcher.experimental_onExtractEnd?.({
        ...toTelemetryEvent(event),
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: telemetry?.includeRuntimeContext,
        }),
      }),
  };
}
