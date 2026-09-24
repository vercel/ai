import { asArray, type Context } from '@ai-sdk/provider-utils';
import type { Callback } from '../util/callback';
import {
  filterIncludedContext,
  filterToolContext,
  filterToolsContext,
} from './filter-included-context';
import { mergeCallbacks } from '../util/merge-callbacks';
import type {
  InferTelemetryEvent,
  Telemetry,
  TelemetryDispatcher,
} from './telemetry';
import {
  openTelemetryChannelSpanContext,
  runWithTracingChannelSpan,
} from './tracing-channel-publisher';
import { getGlobalTelemetryIntegrations } from './telemetry-registry';
import type { TelemetryOptions } from './telemetry-options';

/**
 * The subset of `TelemetryDispatcher` keys whose values are Callback callbacks.
 * This excludes dispatcher-only helpers and non-Callback properties such as
 * `executeLanguageModelCall` and `executeTool`.
 */
type TelemetryCallbackKey = Exclude<
  keyof {
    [K in keyof TelemetryDispatcher as TelemetryDispatcher[K] extends
      | Callback<any>
      | undefined
      ? K
      : never]: true;
  },
  'runInTracingChannelSpan' | 'startTracingChannelContext'
>;

/**
 * Resolves the public  event type accepted by a telemetry callback key.
 */
type TelemetryEvent<K extends TelemetryCallbackKey> =
  TelemetryDispatcher[K] extends Callback<infer EVENT> | undefined
    ? EVENT
    : never;

function augmentEvent<EVENT>(
  event: EVENT,
  telemetry: Pick<
    TelemetryOptions,
    | 'recordInputs'
    | 'recordOutputs'
    | 'functionId'
    | 'includeRuntimeContext'
    | 'includeToolsContext'
  >,
  filterContext = false,
): InferTelemetryEvent<EVENT> {
  const augmentedEvent = Object.assign(
    Object.create(Object.getPrototypeOf(event)),
    event,
    {
      recordInputs: telemetry.recordInputs,
      recordOutputs: telemetry.recordOutputs,
      functionId: telemetry.functionId,
    },
  );

  if (
    filterContext &&
    event != null &&
    typeof event === 'object' &&
    'runtimeContext' in event
  ) {
    augmentedEvent.runtimeContext = filterIncludedContext({
      context: event.runtimeContext as Context,
      includeContext: telemetry.includeRuntimeContext,
    });
  }

  if (filterContext && event != null && typeof event === 'object') {
    if ('toolsContext' in event) {
      augmentedEvent.toolsContext = filterToolsContext({
        toolsContext: event.toolsContext as Record<string, Context>,
        includeToolsContext: telemetry.includeToolsContext,
      });
    } else if (
      'toolContext' in event &&
      event.toolContext != null &&
      'toolCall' in event &&
      event.toolCall != null &&
      typeof event.toolCall === 'object' &&
      'toolName' in event.toolCall
    ) {
      augmentedEvent.toolContext = filterToolContext({
        toolName: event.toolCall.toolName as string,
        toolContext: event.toolContext,
        includeToolsContext: telemetry.includeToolsContext,
      });
    }
  }

  return augmentedEvent;
}

/**
 * Creates a telemetry dispatcher that sends telemetry events
 * to the resolved set of integrations.
 *
 * When per-call integrations are provided, they take precedence over the globally
 * registered integrations for that call. When no per-call integrations are
 * provided, the globally registered integrations are used.
 *
 * @param args.telemetry - Optional per-call telemetry settings and integrations.
 *
 * @returns A telemetry dispatcher that fans out lifecycle events to the
 * resolved set of integrations.
 */
export function createTelemetryDispatcher({
  telemetry,
}: {
  telemetry?: TelemetryOptions;
  // operationId: string;
}): TelemetryDispatcher {
  // When telemetry is explicitly disabled, return a dispatcher
  // that performs no work and lets tool execution pass through unwrapped.
  if (telemetry?.isEnabled === false) {
    return {};
  }

  const localIntegrations = telemetry?.integrations;
  const integrations: Array<Telemetry> =
    localIntegrations != null
      ? asArray(localIntegrations)
      : getGlobalTelemetryIntegrations();

  const telemetryMetadata = {
    recordInputs: telemetry?.recordInputs,
    recordOutputs: telemetry?.recordOutputs,
    functionId: telemetry?.functionId,
    includeRuntimeContext: telemetry?.includeRuntimeContext,
    includeToolsContext: telemetry?.includeToolsContext,
  };

  const mergeTelemetryCallback = <KEY extends TelemetryCallbackKey>(
    key: KEY,
  ): Callback<TelemetryEvent<KEY>> => {
    const integrationCallbacks = (
      integrations
        .map(integration => integration[key]?.bind(integration))
        .filter(Boolean) as Array<
        Callback<InferTelemetryEvent<TelemetryEvent<KEY>>>
      >
    ).map(
      callback =>
        ((event: TelemetryEvent<KEY>) =>
          callback(augmentEvent(event, telemetryMetadata))) as Callback<
          TelemetryEvent<KEY>
        >,
    );

    const mergedIntegrationCallback = mergeCallbacks(...integrationCallbacks);

    return async (event: TelemetryEvent<KEY>) => {
      await mergedIntegrationCallback(event);
    };
  };

  const executeLanguageModelCallWrappers = integrations
    .map(integration => integration.executeLanguageModelCall?.bind(integration))
    .filter(Boolean) as Array<
    NonNullable<Telemetry['executeLanguageModelCall']>
  >;

  const executeToolWrappers = integrations
    .map(integration => integration.executeTool?.bind(integration))
    .filter(Boolean) as Array<NonNullable<Telemetry['executeTool']>>;

  return {
    runInTracingChannelSpan: async ({ type, event, execute }) =>
      await runWithTracingChannelSpan(
        {
          type,
          event: augmentEvent(event, telemetryMetadata, true),
        },
        execute,
      ),

    startTracingChannelContext: ({ type, event, completion }) =>
      openTelemetryChannelSpanContext({
        message: {
          type,
          event: augmentEvent(event, telemetryMetadata, true),
        },
        completion,
      }),

    onStart: mergeTelemetryCallback('onStart'),
    onStepStart: mergeTelemetryCallback('onStepStart'),
    onLanguageModelCallStart: mergeTelemetryCallback(
      'onLanguageModelCallStart',
    ),
    onLanguageModelCallEnd: mergeTelemetryCallback('onLanguageModelCallEnd'),
    onToolExecutionStart: mergeTelemetryCallback('onToolExecutionStart'),
    onToolExecutionEnd: mergeTelemetryCallback('onToolExecutionEnd'),
    // Fan out step-end events to both the new `onStepEnd` callback and the
    // deprecated `onStepFinish` callback so integrations that still implement
    // only `onStepFinish` keep receiving step-end events during the deprecation
    // window.
    onStepEnd: mergeCallbacks(
      mergeTelemetryCallback('onStepEnd'),
      mergeTelemetryCallback('onStepFinish'),
    ),
    onObjectStepStart: mergeTelemetryCallback('onObjectStepStart'),
    onObjectStepEnd: mergeTelemetryCallback('onObjectStepEnd'),
    onEmbedStart: mergeTelemetryCallback('onEmbedStart'),
    onEmbedEnd: mergeTelemetryCallback('onEmbedEnd'),
    onRerankStart: mergeTelemetryCallback('onRerankStart'),
    onRerankEnd: mergeTelemetryCallback('onRerankEnd'),
    experimental_onEvaluateStart: mergeTelemetryCallback(
      'experimental_onEvaluateStart',
    ),
    experimental_onEvaluationModelCallStart: mergeTelemetryCallback(
      'experimental_onEvaluationModelCallStart',
    ),
    experimental_onEvaluationModelCallEnd: mergeTelemetryCallback(
      'experimental_onEvaluationModelCallEnd',
    ),
    experimental_onEvaluateEnd: mergeTelemetryCallback(
      'experimental_onEvaluateEnd',
    ),
    experimental_onStreamTranscriptionStart: mergeTelemetryCallback(
      'experimental_onStreamTranscriptionStart',
    ),
    experimental_onStreamTranscriptionEnd: mergeTelemetryCallback(
      'experimental_onStreamTranscriptionEnd',
    ),
    onEnd: mergeTelemetryCallback('onEnd'),
    onAbort: mergeTelemetryCallback('onAbort'),
    onError: mergeTelemetryCallback('onError'),

    /**
     * Runs provider calls inside integration-specific context so
     * auto-instrumented provider requests can be associated with model work.
     */
    executeLanguageModelCall: async ({ execute, ...event }) => {
      const augmentedEvent = augmentEvent(event, telemetryMetadata);

      let wrappedExecute = execute;
      for (const executeWrapper of executeLanguageModelCallWrappers) {
        const innerExecute = wrappedExecute;
        wrappedExecute = () =>
          executeWrapper({ ...augmentedEvent, execute: innerExecute });
      }

      return await runWithTracingChannelSpan(
        { type: 'languageModelCall', event: augmentedEvent },
        wrappedExecute,
      );
    },

    /**
     * Composes all `executeTool` wrappers around the original tool execution.
     * Each wrapper receives an `execute` function that calls the next wrapper in
     * the chain, so integrations can establish nested telemetry context before
     * delegating to the underlying tool.
     */
    executeTool: async ({ execute, ...event }) => {
      const augmentedEvent = augmentEvent(event, telemetryMetadata);

      let wrappedExecute = execute;
      for (const executeWrapper of executeToolWrappers) {
        const innerExecute = wrappedExecute;
        wrappedExecute = () =>
          executeWrapper({ ...augmentedEvent, execute: innerExecute });
      }

      return await wrappedExecute();
    },
  };
}
