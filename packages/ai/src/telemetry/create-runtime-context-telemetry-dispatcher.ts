import type { Context } from '@ai-sdk/provider-utils';
import type { EmbedEndEvent, EmbedStartEvent } from '../embed/embed-events';
import type { RerankEndEvent, RerankStartEvent } from '../rerank/rerank-events';
import type { Callback } from '../util/callback';
import { createTelemetryDispatcher } from './create-telemetry-dispatcher';
import { filterIncludedContext } from './filter-included-context';
import type { TelemetryDispatcher } from './telemetry';
import type { IncludedContext, TelemetryOptions } from './telemetry-options';

type RuntimeContextEvent<RUNTIME_CONTEXT extends Context> = {
  readonly runtimeContext: RUNTIME_CONTEXT;
};

type RuntimeContextOperationStartEvent<RUNTIME_CONTEXT extends Context> =
  | EmbedStartEvent<RUNTIME_CONTEXT>
  | RerankStartEvent<RUNTIME_CONTEXT>;

type RuntimeContextOperationEndEvent<RUNTIME_CONTEXT extends Context> =
  | EmbedEndEvent<RUNTIME_CONTEXT>
  | RerankEndEvent<RUNTIME_CONTEXT>;

export type RuntimeContextErrorEvent<RUNTIME_CONTEXT extends Context> = {
  readonly callId: string;
  readonly error: unknown;
  readonly runtimeContext: RUNTIME_CONTEXT;
};

type RuntimeContextTelemetryDispatcher<
  RUNTIME_CONTEXT extends Context,
  START_EVENT extends RuntimeContextOperationStartEvent<RUNTIME_CONTEXT>,
  END_EVENT extends RuntimeContextOperationEndEvent<RUNTIME_CONTEXT>,
> = Omit<TelemetryDispatcher, 'onStart' | 'onEnd' | 'onError'> & {
  onStart: Callback<START_EVENT>;
  onEnd: Callback<END_EVENT>;
  onError: Callback<RuntimeContextErrorEvent<RUNTIME_CONTEXT>>;
};

function restrictRuntimeContext<
  RUNTIME_CONTEXT extends Context,
  EVENT extends RuntimeContextEvent<RUNTIME_CONTEXT>,
>({
  event,
  includeRuntimeContext,
}: {
  event: EVENT;
  includeRuntimeContext: IncludedContext<RUNTIME_CONTEXT>;
}): EVENT {
  return {
    ...event,
    runtimeContext: filterIncludedContext({
      context: event.runtimeContext,
      includeContext: includeRuntimeContext,
    }),
  } as EVENT;
}

/**
 * Creates a telemetry dispatcher that only includes configured runtime context
 * properties in operation events before dispatching them to integrations and
 * the diagnostics tracing channel.
 */
export function createRuntimeContextTelemetryDispatcher<
  RUNTIME_CONTEXT extends Context,
  START_EVENT extends RuntimeContextOperationStartEvent<RUNTIME_CONTEXT>,
  END_EVENT extends RuntimeContextOperationEndEvent<RUNTIME_CONTEXT>,
>({
  telemetry,
  includeRuntimeContext,
}: {
  telemetry?: TelemetryOptions<RUNTIME_CONTEXT>;
  includeRuntimeContext: IncludedContext<RUNTIME_CONTEXT>;
}): RuntimeContextTelemetryDispatcher<RUNTIME_CONTEXT, START_EVENT, END_EVENT> {
  const telemetryDispatcher = createTelemetryDispatcher({ telemetry });

  return {
    ...telemetryDispatcher,
    runInTracingChannelSpan: telemetryDispatcher.runInTracingChannelSpan
      ? options =>
          telemetryDispatcher.runInTracingChannelSpan!({
            ...options,
            event:
              options.event != null &&
              typeof options.event === 'object' &&
              'runtimeContext' in options.event
                ? restrictRuntimeContext({
                    event:
                      options.event as RuntimeContextEvent<RUNTIME_CONTEXT>,
                    includeRuntimeContext,
                  })
                : options.event,
          })
      : undefined,
    onStart: event =>
      telemetryDispatcher.onStart?.(
        restrictRuntimeContext({ event, includeRuntimeContext }),
      ),
    onEnd: event =>
      telemetryDispatcher.onEnd?.(
        restrictRuntimeContext({ event, includeRuntimeContext }),
      ),
    onError: event =>
      telemetryDispatcher.onError?.(
        restrictRuntimeContext({ event, includeRuntimeContext }),
      ),
  };
}
