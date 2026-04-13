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
  ].map(
    /**
     * Wraps a telemetry integration with bound methods.
     * Use this when creating class-based integrations to ensure methods
     * work correctly when passed as callbacks.
     */
    integration => ({
      onStart: integration.onStart?.bind(integration),
      onStepStart: integration.onStepStart?.bind(integration),
      onToolCallStart: integration.onToolCallStart?.bind(integration),
      onToolCallFinish: integration.onToolCallFinish?.bind(integration),
      onChunk: integration.onChunk?.bind(integration),
      onStepFinish: integration.onStepFinish?.bind(integration),
      onObjectStepStart: integration.onObjectStepStart?.bind(integration),
      onObjectStepFinish: integration.onObjectStepFinish?.bind(integration),
      onEmbedStart: integration.onEmbedStart?.bind(integration),
      onEmbedFinish: integration.onEmbedFinish?.bind(integration),
      onRerankStart: integration.onRerankStart?.bind(integration),
      onRerankFinish: integration.onRerankFinish?.bind(integration),
      onFinish: integration.onFinish?.bind(integration),
      onError: integration.onError?.bind(integration),
      executeTool: integration.executeTool?.bind(integration),
    }),
  );

  function createTelemetryComposite<KEY extends TelemetryListenerKey>(
    key: KEY,
  ): Listener<TelemetryEvent<KEY>> | undefined {
    const listeners = integrations
      .map(integration => integration[key])
      .filter(Boolean) as Array<Listener<TelemetryEvent<KEY>>>;

    return mergeListeners(...listeners);
  }

  const executeWrappers = integrations
    .map(integration => integration.executeTool)
    .filter(Boolean) as Array<TelemetryIntegration['executeTool']>;

  return {
    onStart: createTelemetryComposite('onStart'),
    onStepStart: createTelemetryComposite('onStepStart'),
    onToolCallStart: createTelemetryComposite('onToolCallStart'),
    onToolCallFinish: createTelemetryComposite('onToolCallFinish'),
    onChunk: createTelemetryComposite('onChunk'),
    onStepFinish: createTelemetryComposite('onStepFinish'),
    onObjectStepStart: createTelemetryComposite('onObjectStepStart'),
    onObjectStepFinish: createTelemetryComposite('onObjectStepFinish'),
    onEmbedStart: createTelemetryComposite('onEmbedStart'),
    onEmbedFinish: createTelemetryComposite('onEmbedFinish'),
    onRerankStart: createTelemetryComposite('onRerankStart'),
    onRerankFinish: createTelemetryComposite('onRerankFinish'),
    onFinish: createTelemetryComposite('onFinish'),
    onError: createTelemetryComposite('onError'),
    executeTool:
      executeWrappers.length > 0
        ? async params => {
            let execute = params.execute;
            for (const wrapper of executeWrappers) {
              const inner = execute;
              execute = () => wrapper!({ ...params, execute: inner });
            }
            return execute();
          }
        : undefined,
  };
}
