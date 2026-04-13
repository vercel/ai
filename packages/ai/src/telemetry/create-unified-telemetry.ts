import { asArray } from '../util/as-array';
import { mergeListeners } from '../util/merge-listeners';
import type { Listener } from '../util/notify';
import type { TelemetryIntegration } from './telemetry-integration';
import { getGlobalTelemetryIntegrations } from './telemetry-integration-registry';

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
  const integrations = [
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

  function createTelemetryComposite<EVENT>(
    getListenerFromIntegration: (
      integration: TelemetryIntegration,
    ) => Listener<EVENT> | undefined,
  ): Listener<EVENT> | undefined {
    const listeners = integrations
      .map(getListenerFromIntegration)
      .filter(Boolean) as Array<Listener<EVENT>>;

    return mergeListeners(...listeners);
  }

  const executeWrappers = integrations
    .map(integration => integration.executeTool)
    .filter(Boolean) as Array<TelemetryIntegration['executeTool']>;

  return {
    onStart: createTelemetryComposite(integration => integration.onStart),
    onStepStart: createTelemetryComposite(
      integration => integration.onStepStart,
    ),
    onToolCallStart: createTelemetryComposite(
      integration => integration.onToolCallStart,
    ),
    onToolCallFinish: createTelemetryComposite(
      integration => integration.onToolCallFinish,
    ),
    onChunk: createTelemetryComposite(integration => integration.onChunk),
    onStepFinish: createTelemetryComposite(
      integration => integration.onStepFinish,
    ),
    onObjectStepStart: createTelemetryComposite(
      integration => integration.onObjectStepStart,
    ),
    onObjectStepFinish: createTelemetryComposite(
      integration => integration.onObjectStepFinish,
    ),
    onEmbedStart: createTelemetryComposite(
      integration => integration.onEmbedStart,
    ),
    onEmbedFinish: createTelemetryComposite(
      integration => integration.onEmbedFinish,
    ),
    onRerankStart: createTelemetryComposite(
      integration => integration.onRerankStart,
    ),
    onRerankFinish: createTelemetryComposite(
      integration => integration.onRerankFinish,
    ),
    onFinish: createTelemetryComposite(integration => integration.onFinish),
    onError: createTelemetryComposite(integration => integration.onError),
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
