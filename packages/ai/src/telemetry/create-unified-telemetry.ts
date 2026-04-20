import { asArray } from '@ai-sdk/provider-utils';
import { Callback } from '../util/callback';
import { mergeCallbacks } from '../util/merge-callbacks';
import type {
  InferTelemetryEvent,
  Telemetry,
  TelemetryDispatcher,
} from './telemetry';
import { getGlobalTelemetryIntegrations } from './telemetry-registry';
import type { TelemetryOptions } from './telemetry-options';

/**
 * The subset of `TelemetryDispatcher` keys whose values are Callback callbacks.
 * This excludes non-Callback properties such as `executeTool`.
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
type PublicTelemetryEvent<K extends TelemetryCallbackKey> =
  TelemetryDispatcher[K] extends Callback<infer EVENT> | undefined
    ? EVENT
    : never;

function augmentEvent<EVENT>(
  event: EVENT,
  telemetry: Pick<
    TelemetryOptions,
    'isEnabled' | 'recordInputs' | 'recordOutputs' | 'functionId'
  >,
): InferTelemetryEvent<EVENT> {
  return Object.assign(
    Object.create(Object.getPrototypeOf(event)),
    event,
    telemetry,
  );
}

/**
 * Creates a unified telemetry target that sends telemetry events
 * to the resolved set of integrations.
 *
 * When per-call integrations are provided, they take precedence over the globally
 * registered integrations for that call. When no per-call integrations are
 * provided, the globally registered integrations are used.
 *
 * @param args.telemetry - Optional per-call telemetry settings and integrations.
 *
 * @returns A telemetry target that fans out lifecycle events to the resolved
 * set of integrations.
 */
export function createUnifiedTelemetry({
  telemetry,
}: {
  telemetry?: TelemetryOptions;
}): TelemetryDispatcher {
  const localIntegrations = telemetry?.integrations;
  const integrations: Array<Telemetry> =
    localIntegrations != null
      ? asArray(localIntegrations)
      : getGlobalTelemetryIntegrations();

  const telemetryMetadata = {
    isEnabled: telemetry?.isEnabled ?? true,
    recordInputs: telemetry?.recordInputs,
    recordOutputs: telemetry?.recordOutputs,
    functionId: telemetry?.functionId,
  };

  const mergeTelemetryCallback = <KEY extends TelemetryCallbackKey>(
    key: KEY,
  ): Callback<PublicTelemetryEvent<KEY>> => {
    const callbacks = integrations
      .map(integration => integration[key]?.bind(integration))
      .filter(Boolean) as Array<
      Callback<InferTelemetryEvent<PublicTelemetryEvent<KEY>>>
    >;

    return mergeCallbacks(
      ...callbacks.map(
        callback =>
          ((event: PublicTelemetryEvent<KEY>) =>
            callback(augmentEvent(event, telemetryMetadata))) as Callback<
            PublicTelemetryEvent<KEY>
          >,
      ),
    );
  };

  const executeWrappers = integrations
    .map(integration => integration.executeTool?.bind(integration))
    .filter(Boolean) as Array<NonNullable<Telemetry['executeTool']>>;

  return {
    onStart: mergeTelemetryCallback('onStart'),
    onStepStart: mergeTelemetryCallback('onStepStart'),
    onToolExecutionStart: mergeTelemetryCallback('onToolExecutionStart'),
    onToolExecutionEnd: mergeTelemetryCallback('onToolExecutionEnd'),
    onChunk: mergeTelemetryCallback('onChunk'),
    onStepFinish: mergeTelemetryCallback('onStepFinish'),
    onObjectStepStart: mergeTelemetryCallback('onObjectStepStart'),
    onObjectStepFinish: mergeTelemetryCallback('onObjectStepFinish'),
    onEmbedStart: mergeTelemetryCallback('onEmbedStart'),
    onEmbedFinish: mergeTelemetryCallback('onEmbedFinish'),
    onRerankStart: mergeTelemetryCallback('onRerankStart'),
    onRerankFinish: mergeTelemetryCallback('onRerankFinish'),
    onFinish: mergeTelemetryCallback('onFinish'),
    onError: mergeTelemetryCallback('onError'),

    /**
     * Composes all `executeTool` wrappers around the original tool execution.
     * Each wrapper receives an `execute` function that calls the next wrapper in
     * the chain, so integrations can establish nested telemetry context before
     * delegating to the underlying tool.
     */
    executeTool:
      executeWrappers.length > 0
        ? async args => {
            let execute = args.execute;
            for (const executeWrapper of executeWrappers) {
              const innerExecute = execute;
              execute = () =>
                executeWrapper({ ...args, execute: innerExecute });
            }
            return await execute();
          }
        : undefined,
  };
}
