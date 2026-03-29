import type { Output } from '../generate-text/output';
import type { ToolSet } from '../generate-text/tool-set';
import { asArray } from '../util/as-array';
import { OpenTelemetryIntegration } from './open-telemetry-integration';
import type { TelemetryIntegration } from './telemetry-integration';
import {
  getGlobalTelemetryIntegrations,
  hasIntegration,
  registerTelemetryIntegration,
} from './telemetry-integration-registry';

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
    onEmbedStart: integration.onEmbedStart?.bind(integration),
    onEmbedFinish: integration.onEmbedFinish?.bind(integration),
    onRerankStart: integration.onRerankStart?.bind(integration),
    onRerankFinish: integration.onRerankFinish?.bind(integration),
    onFinish: integration.onFinish?.bind(integration),
    onError: integration.onError?.bind(integration),
    executeTool: integration.executeTool?.bind(integration),
  };
}

// global otel integration TODO remove when OTel is moved to a separate package
const otelIntegration = new OpenTelemetryIntegration();

export function getGlobalTelemetryIntegration<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
>(): (args?: {
  integrations?: TelemetryIntegration | Array<TelemetryIntegration>;
}) => TelemetryIntegration {
  if (!hasIntegration(otelIntegration)) {
    registerTelemetryIntegration(otelIntegration);
  }

  const globalIntegrations = getGlobalTelemetryIntegrations();

  return ({
    integrations,
  }: {
    integrations?: TelemetryIntegration | Array<TelemetryIntegration>;
  } = {}): TelemetryIntegration => {
    const localIntegrations = asArray(integrations);
    const allIntegrations = [...globalIntegrations, ...localIntegrations].map(
      bindTelemetryIntegration,
    );

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

    const executeWrappers = allIntegrations
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
  };
}
