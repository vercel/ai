import type { Tracer } from '@opentelemetry/api';
import type { Output } from '../generate-text/output';
import type { ToolSet } from '../generate-text/tool-set';
import { asArray } from '../util/as-array';
import { otelIntegration } from './otel-event-handler';
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
    onFinish: integration.onFinish?.bind(integration),
    onError: integration.onError?.bind(integration),
    wrapToolExecution: integration.wrapToolExecution?.bind(integration),
  };
}

export function getGlobalTelemetryIntegration<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
>(): (args?: {
  tracer?: Tracer;
  integrations?: TelemetryIntegration | Array<TelemetryIntegration>;
}) => TelemetryIntegration {
  if (!hasIntegration(otelIntegration)) {
    registerTelemetryIntegration(otelIntegration);
  }

  const globalIntegrations = getGlobalTelemetryIntegrations();

  return ({
    tracer,
    integrations,
  }: {
    tracer?: Tracer;
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
      prepareEvent?: (event: EVENT) => void,
    ): ((event: EVENT) => Promise<void>) | undefined {
      const listeners = allIntegrations
        .map(getListenerFromIntegration)
        .filter(Boolean) as Array<(event: EVENT) => PromiseLike<void> | void>;

      return async (event: EVENT) => {
        prepareEvent?.(event);

        for (const listener of listeners) {
          try {
            await listener(event);
          } catch (_ignored) {}
        }
      };
    }

    const wrappers = allIntegrations
      .map(i => i.wrapToolExecution)
      .filter(Boolean) as Array<TelemetryIntegration['wrapToolExecution']>;

    return {
      onStart: createTelemetryComposite(
        integration => integration.onStart,
        event => {
          if (tracer != null) {
            otelIntegration.configureTracerForCall({
              callId: (event as { callId: string }).callId,
              tracer,
            });
          }
        },
      ),
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
      wrapToolExecution:
        wrappers.length > 0
          ? async params => {
              let fn = params.fn;
              for (const wrapper of wrappers) {
                const inner = fn;
                fn = () => wrapper!({ ...params, fn: inner });
              }
              return fn();
            }
          : undefined,
    };
  };
}
