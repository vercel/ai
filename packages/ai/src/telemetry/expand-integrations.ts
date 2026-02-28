import type {
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  OnToolCallFinishEvent,
  OnToolCallStartEvent,
} from '../generate-text/callback-events';
import type { Output } from '../generate-text/output';
import type { ToolSet } from '../generate-text/tool-set';
import type { TelemetryIntegration } from './telemetry-integration';
import { getGlobalTelemetryIntegrations } from './telemetry-integration-registry';

/**
 * Wraps a telemetry integration with bound methods.
 * Use this when creating class-based integrations to ensure methods
 * work correctly when passed as callbacks.
 */
export function bindTelemetryIntegration<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
>(
  integration: TelemetryIntegration<TOOLS, OUTPUT>,
): TelemetryIntegration<TOOLS, OUTPUT> {
  return {
    onStart: integration.onStart?.bind(integration),
    onStepStart: integration.onStepStart?.bind(integration),
    onToolCallStart: integration.onToolCallStart?.bind(integration),
    onToolCallFinish: integration.onToolCallFinish?.bind(integration),
    onStepFinish: integration.onStepFinish?.bind(integration),
    onFinish: integration.onFinish?.bind(integration),
  };
}

export interface ExpandedTelemetryListeners<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
> {
  onStart: ((event: OnStartEvent<TOOLS, OUTPUT>) => Promise<void>) | undefined;
  onStepStart:
    | ((event: OnStepStartEvent<TOOLS, OUTPUT>) => Promise<void>)
    | undefined;
  onToolCallStart:
    | ((event: OnToolCallStartEvent<TOOLS>) => Promise<void>)
    | undefined;
  onToolCallFinish:
    | ((event: OnToolCallFinishEvent<TOOLS>) => Promise<void>)
    | undefined;
  onStepFinish:
    | ((event: OnStepFinishEvent<TOOLS>) => Promise<void>)
    | undefined;
  onFinish: ((event: OnFinishEvent<TOOLS>) => Promise<void>) | undefined;
}

/**
 * Expands telemetry integrations into individual listener functions.
 * Merges globally registered integrations (via `registerTelemetryIntegration`)
 * with per-call integrations. Global integrations run first.
 */
export function expandIntegrations<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
>(
  integrations: TelemetryIntegration | Array<TelemetryIntegration> | undefined,
): ExpandedTelemetryListeners<TOOLS, OUTPUT> {
  const globalIntegrations = getGlobalTelemetryIntegrations();
  const localIntegrations =
    integrations == null
      ? []
      : Array.isArray(integrations)
        ? integrations
        : [integrations];

  const allIntegrations = [...globalIntegrations, ...localIntegrations];

  if (allIntegrations.length === 0) {
    return {
      onStart: undefined,
      onStepStart: undefined,
      onToolCallStart: undefined,
      onToolCallFinish: undefined,
      onStepFinish: undefined,
      onFinish: undefined,
    };
  }

  const integrationList = allIntegrations as unknown as Array<
    TelemetryIntegration<TOOLS, OUTPUT>
  >;

  function createBroadcastListener<EVENT>(
    getListenerFromIntegration: (
      integration: TelemetryIntegration<TOOLS, OUTPUT>,
    ) => ((event: EVENT) => PromiseLike<void> | void) | undefined,
  ): ((event: EVENT) => Promise<void>) | undefined {
    const listeners = integrationList
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
    onStart: createBroadcastListener(integration => integration.onStart),
    onStepStart: createBroadcastListener(
      integration => integration.onStepStart,
    ),
    onToolCallStart: createBroadcastListener(
      integration => integration.onToolCallStart,
    ),
    onToolCallFinish: createBroadcastListener(
      integration => integration.onToolCallFinish,
    ),
    onStepFinish: createBroadcastListener(
      integration => integration.onStepFinish,
    ),
    onFinish: createBroadcastListener(integration => integration.onFinish),
  };
}
