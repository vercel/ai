import { asArray } from '../util/as-array';
import type { TelemetryIntegration } from './telemetry-integration';
import { getGlobalTelemetryIntegrations } from './telemetry-integration-registry';

/**
 * Wraps a telemetry integration with bound methods.
 * Use this when creating class-based integrations to ensure methods
 * work correctly when passed as callbacks.
 */
export function bindTelemetryIntegration(
  integration: TelemetryIntegration,
): TelemetryIntegration {
  return {
    onStart: integration.onStart?.bind(integration),
    onStepStart: integration.onStepStart?.bind(integration),
    onToolCallStart: integration.onToolCallStart?.bind(integration),
    onToolCallFinish: integration.onToolCallFinish?.bind(integration),
    onStepFinish: integration.onStepFinish?.bind(integration),
    onFinish: integration.onFinish?.bind(integration),
  };
}

/**
 * Merges globally registered integrations (via `registerTelemetryIntegration`)
 * with per-call integrations into a single composite integration.
 * Global integrations run first.
 */
export function getGlobalTelemetryIntegration(
  integrations: TelemetryIntegration | Array<TelemetryIntegration> | undefined,
): TelemetryIntegration {
  const globalIntegrations = getGlobalTelemetryIntegrations();
  const localIntegrations = asArray(integrations);
  const allIntegrations = [...globalIntegrations, ...localIntegrations];

  function createTelemetryComposite<EVENT>(
    getListenerFromIntegration: (
      integration: TelemetryIntegration,
    ) => ((event: EVENT) => PromiseLike<void> | void) | undefined,
  ): ((event: EVENT) => Promise<void>) | undefined {
    const listeners = allIntegrations
      .map(getListenerFromIntegration)
      .filter(Boolean) as Array<(event: EVENT) => PromiseLike<void> | void>;

    if (listeners.length === 0) return undefined;

    return async (event: EVENT) => {
      for (const listener of listeners) {
        try {
          await listener(event);
        } catch (_ignored) {}
      }
    };
  }

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
    onStepFinish: createTelemetryComposite(
      integration => integration.onStepFinish,
    ),
    onFinish: createTelemetryComposite(integration => integration.onFinish),
  };
}
