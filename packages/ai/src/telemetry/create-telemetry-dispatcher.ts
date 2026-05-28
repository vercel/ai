import { asArray } from '@ai-sdk/provider-utils';
import type { Callback } from '../util/callback';
import { mergeCallbacks } from '../util/merge-callbacks';
import type {
  InferTelemetryEvent,
  Telemetry,
  TelemetryDispatcher,
} from './telemetry';
import { traceTelemetryChannelPromise } from './tracing-channel-publisher';
import { type TelemetryTracingEventType } from './tracing-channel';
import { getGlobalTelemetryIntegrations } from './telemetry-registry';
import type { TelemetryOptions } from './telemetry-options';

/**
 * The subset of `TelemetryDispatcher` keys whose values are Callback callbacks.
 * This excludes non-Callback properties such as `executeLanguageModelCall` and
 * `executeTool`.
 */
type TelemetryCallbackKey = keyof {
  [K in keyof TelemetryDispatcher as TelemetryDispatcher[K] extends
    | Callback<any>
    | undefined
    ? K
    : never]: true;
};

/**
 * Resolves the public event type accepted by a telemetry callback key.
 */
type TelemetryEvent<K extends TelemetryCallbackKey> =
  TelemetryDispatcher[K] extends Callback<infer EVENT> | undefined
    ? EVENT
    : never;

function augmentEvent<EVENT>(
  event: EVENT,
  telemetry: Pick<
    TelemetryOptions,
    'recordInputs' | 'recordOutputs' | 'functionId'
  >,
): InferTelemetryEvent<EVENT> {
  return Object.assign(
    Object.create(Object.getPrototypeOf(event)),
    event,
    telemetry,
  );
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
  };

  const mergeTelemetryCallback = <KEY extends TelemetryCallbackKey>(
    key: KEY,
  ): Callback<TelemetryEvent<KEY>> => {
    // Integration callbacks receive the augmented event, while tracing uses the
    // same augmented payload as its context object for subscribers.
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
      const augmentedEvent = augmentEvent(event, telemetryMetadata);

      await traceTelemetryChannelPromise(
        {
          type: key as TelemetryTracingEventType,
          event: augmentedEvent,
        },
        async () => await mergedIntegrationCallback(event),
      );
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
    onStart: mergeTelemetryCallback('onStart'),
    onStepStart: mergeTelemetryCallback('onStepStart'),
    onLanguageModelCallStart: mergeTelemetryCallback(
      'onLanguageModelCallStart',
    ),
    onLanguageModelCallEnd: mergeTelemetryCallback('onLanguageModelCallEnd'),
    onToolExecutionStart: mergeTelemetryCallback('onToolExecutionStart'),
    onToolExecutionEnd: mergeTelemetryCallback('onToolExecutionEnd'),
    onStepFinish: mergeTelemetryCallback('onStepFinish'),
    onObjectStepStart: mergeTelemetryCallback('onObjectStepStart'),
    onObjectStepFinish: mergeTelemetryCallback('onObjectStepFinish'),
    onEmbedStart: mergeTelemetryCallback('onEmbedStart'),
    onEmbedEnd: mergeTelemetryCallback('onEmbedEnd'),
    onRerankStart: mergeTelemetryCallback('onRerankStart'),
    onRerankEnd: mergeTelemetryCallback('onRerankEnd'),
    onEnd: mergeTelemetryCallback('onEnd'),
    onAbort: mergeTelemetryCallback('onAbort'),
    onError: mergeTelemetryCallback('onError'),

    /**
     * Runs provider calls inside the tracing channel so subscriber-bound async
     * context stays active for auto-instrumented provider requests.
     */
    executeLanguageModelCall: async args => {
      const tracingEvent = augmentEvent(
        args.event ?? { callId: args.callId },
        telemetryMetadata,
      );
      let execute = args.execute;
      for (const executeWrapper of executeLanguageModelCallWrappers) {
        const innerExecute = execute;
        execute = () => {
          // Only pass `event` to integrations when the caller provided the full
          // model-call start event; tracing can fall back to callId-only context.
          const executeArgs =
            args.event == null
              ? { ...args, execute: innerExecute }
              : {
                  ...args,
                  event: augmentEvent(args.event, telemetryMetadata),
                  execute: innerExecute,
                };

          return executeWrapper(executeArgs);
        };
      }
      return await traceTelemetryChannelPromise(
        {
          type: 'executeLanguageModelCall',
          event: tracingEvent,
        },
        execute,
      );
    },

    /**
     * Composes all `executeTool` wrappers around the original tool execution.
     * Each wrapper receives an `execute` function that calls the next wrapper in
     * the chain, so integrations can establish nested telemetry context before
     * delegating to the underlying tool. The outer tracing wrapper keeps that
     * context active for any nested AI SDK calls made by the tool.
     */
    executeTool: async args => {
      const tracingEvent = augmentEvent(
        args.event ?? { callId: args.callId, toolCallId: args.toolCallId },
        telemetryMetadata,
      );
      let execute = args.execute;
      for (const executeWrapper of executeToolWrappers) {
        const innerExecute = execute;
        execute = () => {
          // Only pass `event` to integrations when the caller provided the full
          // tool start event; tracing can fall back to callId/toolCallId context.
          const executeArgs =
            args.event == null
              ? { ...args, execute: innerExecute }
              : {
                  ...args,
                  event: augmentEvent(args.event, telemetryMetadata),
                  execute: innerExecute,
                };

          return executeWrapper(executeArgs);
        };
      }
      return await traceTelemetryChannelPromise(
        {
          type: 'executeTool',
          event: tracingEvent,
        },
        execute,
      );
    },
  };
}
