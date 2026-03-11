import type { Tracer } from '@opentelemetry/api';
import type { Output } from '../generate-text/output';
import type { ToolSet } from '../generate-text/tool-set';
import { asArray } from '../util/as-array';
import { createOtelIntegration } from './otel-event-handler';
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
    onChunk: integration.onChunk?.bind(integration),
    onStepFinish: integration.onStepFinish?.bind(integration),
    onFinish: integration.onFinish?.bind(integration),
    onError: integration.onError?.bind(integration),
  };
}

/**
 * Creates a factory that merges a per-call OTEL integration,
 * globally registered integrations (via `registerTelemetryIntegration`),
 * and per-call integrations into a single composite integration.
 *
 * A fresh OTEL integration is created for each call using the
 * provided tracer, avoiding a global singleton.
 *
 * Returns a factory function that accepts per-call args and
 * returns the merged TelemetryIntegration.
 */
export function getGlobalTelemetryIntegration<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
>(): (args?: {
  tracer?: Tracer;
  integrations?: TelemetryIntegration | Array<TelemetryIntegration>;
}) => TelemetryIntegration {
  return ({
    tracer,
    integrations,
  }: {
    tracer?: Tracer;
    integrations?: TelemetryIntegration | Array<TelemetryIntegration>;
  } = {}): TelemetryIntegration => {
    const globalIntegrations = getGlobalTelemetryIntegrations();
    const localIntegrations = asArray(integrations);

    const allIntegrations = [
      createOtelIntegration({ tracer }),
      ...globalIntegrations,
      ...localIntegrations,
    ].map(bindTelemetryIntegration);

    function createTelemetryComposite<EVENT>(
      getListenerFromIntegration: (
        integration: TelemetryIntegration,
      ) => ((event: EVENT) => PromiseLike<void> | void) | undefined,
    ): ((event: EVENT) => Promise<void>) | undefined {
      const listeners = allIntegrations
        .map(getListenerFromIntegration)
        .filter(Boolean) as Array<(event: EVENT) => PromiseLike<void> | void>;

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
      onChunk: createTelemetryComposite(integration => integration.onChunk),
      onStepFinish: createTelemetryComposite(
        integration => integration.onStepFinish,
      ),
      onFinish: createTelemetryComposite(integration => integration.onFinish),
      onError: createTelemetryComposite(integration => integration.onError),
    };
  };
}
