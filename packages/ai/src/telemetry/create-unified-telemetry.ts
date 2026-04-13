import { asArray } from '../util/as-array';
import { mergeListeners } from '../util/merge-listeners';
import type { Listener } from '../util/notify';
import type { TelemetryIntegration } from './telemetry-integration';
import { getGlobalTelemetryIntegrations } from './telemetry-integration-registry';

/**
 * The subset of `TelemetryIntegration` keys whose values are listener callbacks.
 * This excludes non-listener properties such as `executeTool`.
 */
type TelemetryListenerKey = keyof {
  [K in keyof TelemetryIntegration as TelemetryIntegration[K] extends
    | Listener<any>
    | undefined
    ? K
    : never]: true;
};

/**
 * Resolves the event type accepted by a telemetry listener key.
 * For example, `'onStepStart'` maps to `OnStepStartEvent`.
 */
type TelemetryEvent<K extends TelemetryListenerKey> =
  TelemetryIntegration[K] extends Listener<infer EVENT> | undefined
    ? EVENT
    : never;

/**
 * Creates a unified telemetry target that sends telemetry events
 * to all registered global telemetry integrations and to
 * any per-call integrations passed to the function.
 *
 * @param args.integrations - Optional per-call integrations to send telemetry events to.
 *
 * @returns A telemetry target that sends telemetry events to all registered global telemetry integrations and to
 * any per-call integrations passed to the function.
 */
export function createUnifiedTelemetry({
  integrations: localIntegrations,
}: {
  integrations?: TelemetryIntegration | Array<TelemetryIntegration>;
}): TelemetryIntegration {
  const integrations: Array<TelemetryIntegration> = [
    ...getGlobalTelemetryIntegrations(),
    ...asArray(localIntegrations),
  ];

  const mergeTelemetryCallback = <KEY extends TelemetryListenerKey>(
    key: KEY,
  ): Listener<TelemetryEvent<KEY>> | undefined =>
    mergeListeners(
      ...(integrations
        .map(integration => integration[key]?.bind(integration))
        .filter(Boolean) as Array<Listener<TelemetryEvent<KEY>>>),
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
