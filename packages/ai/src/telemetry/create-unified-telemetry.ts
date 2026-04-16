import { asArray } from '../util/as-array';
import { Callback } from '../util/callback';
import { mergeCallbacks } from '../util/merge-callbacks';
import type { TelemetryIntegration } from './telemetry-integration';
import { getGlobalTelemetryIntegrations } from './telemetry-registry';

/**
 * The subset of `TelemetryIntegration` keys whose values are Callback callbacks.
 * This excludes non-Callback properties such as `executeTool`.
 */
type TelemetryCallbackKey = keyof {
  [K in keyof TelemetryIntegration as TelemetryIntegration[K] extends
    | Callback<any>
    | undefined
    ? K
    : never]: true;
};

/**
 * Resolves the event type accepted by a telemetry Callback key.
 * For example, `'onStepStart'` maps to `OnStepStartEvent`.
 */
type TelemetryEvent<K extends TelemetryCallbackKey> =
  TelemetryIntegration[K] extends Callback<infer EVENT> | undefined
    ? EVENT
    : never;

/**
 * Creates a unified telemetry target that sends telemetry events
 * to the resolved set of integrations.
 *
 * When per-call integrations are provided, they take precedence over the globally
 * registered integrations for that call. When no per-call integrations are
 * provided, the globally registered integrations are used.
 *
 * @param args.integrations - Optional per-call integrations to onlysend telemetry events to.
 *
 * @returns A telemetry target that fans out lifecycle events to the resolved
 * set of integrations.
 */
export function createUnifiedTelemetry({
  integrations: localIntegrations,
}: {
  integrations?: TelemetryIntegration | Array<TelemetryIntegration>;
}): TelemetryIntegration {
  const integrations: Array<TelemetryIntegration> =
    localIntegrations != null
      ? asArray(localIntegrations)
      : getGlobalTelemetryIntegrations();

  const mergeTelemetryCallback = <KEY extends TelemetryCallbackKey>(
    key: KEY,
  ): Callback<TelemetryEvent<KEY>> | undefined =>
    mergeCallbacks(
      ...(integrations
        .map(integration => integration[key]?.bind(integration))
        .filter(Boolean) as Array<Callback<TelemetryEvent<KEY>>>),
    );

  const executeWrappers = integrations
    .map(integration => integration.executeTool?.bind(integration))
    .filter(Boolean) as Array<NonNullable<TelemetryIntegration['executeTool']>>;

  return {
    onStart: mergeTelemetryCallback('onStart'),
    onStepStart: mergeTelemetryCallback('onStepStart'),
    onToolCallStart: mergeTelemetryCallback('onToolCallStart'),
    onToolCallFinish: mergeTelemetryCallback('onToolCallFinish'),
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
            return execute();
          }
        : undefined,
  };
}
