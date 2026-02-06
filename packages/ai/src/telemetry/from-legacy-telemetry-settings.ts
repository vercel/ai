import type { TelemetrySettings } from './telemetry-settings';
import type { TelemetryConfig, TelemetryAttributeValue } from './types';
import { otel } from './handlers/otel-handler';

/**
 * Converts the legacy `TelemetrySettings` to the new `TelemetryConfig`.
 *
 * When `isEnabled` is true, creates an OTel-backed config
 * (using the provided tracer or the global one).
 *
 * Returns `undefined` if telemetry is disabled, which causes
 * the `TelemetryEmitter` to use the noop handler.
 *
 * @internal Bridge for files not yet migrated to the new API.
 */
export function fromLegacyTelemetrySettings(
  settings: TelemetrySettings | undefined,
): TelemetryConfig | undefined {
  if (settings?.isEnabled !== true) {
    return undefined;
  }

  const otelConfig = otel({ tracer: settings.tracer });

  return {
    handler: otelConfig.handler,
    functionId: settings.functionId,
    metadata: settings.metadata as
      | Record<string, TelemetryAttributeValue>
      | undefined,
    recordInputs: settings.recordInputs,
    recordOutputs: settings.recordOutputs,
  };
}
