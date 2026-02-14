import type { TelemetryAttributes, TelemetryAttributeValue } from './types';
import { CallSettings, getTotalTimeoutMs } from '../prompt/call-settings';

/**
 * Builds the base telemetry attributes common to all operations:
 * model info, call settings, request headers, and (optionally) metadata.
 *
 * For migrated functions, metadata injection is handled by the
 * TelemetryEmitter. The optional `telemetry` param is kept for
 * backward compatibility with un-migrated call sites.
 */
export function getBaseTelemetryAttributes({
  model,
  settings,
  telemetry,
  headers,
}: {
  model: { modelId: string; provider: string };
  settings: Omit<CallSettings, 'abortSignal' | 'headers' | 'temperature'>;
  telemetry?: { metadata?: Record<string, unknown> };
  headers: Record<string, string | undefined> | undefined;
}): TelemetryAttributes {
  return {
    'ai.model.provider': model.provider,
    'ai.model.id': model.modelId,

    // settings:
    ...Object.entries(settings).reduce((attributes, [key, value]) => {
      // Handle timeout specially since it can be a number or object
      if (key === 'timeout') {
        const totalTimeoutMs = getTotalTimeoutMs(
          value as Parameters<typeof getTotalTimeoutMs>[0],
        );
        if (totalTimeoutMs != null) {
          attributes[`ai.settings.${key}`] = totalTimeoutMs;
        }
      } else {
        attributes[`ai.settings.${key}`] = value as TelemetryAttributeValue;
      }
      return attributes;
    }, {} as TelemetryAttributes),

    // metadata (for un-migrated call sites; migrated ones use TelemetryEmitter):
    ...Object.entries(telemetry?.metadata ?? {}).reduce(
      (attributes, [key, value]) => {
        attributes[`ai.telemetry.metadata.${key}`] =
          value as TelemetryAttributeValue;
        return attributes;
      },
      {} as TelemetryAttributes,
    ),

    // request headers
    ...Object.entries(headers ?? {}).reduce((attributes, [key, value]) => {
      if (value !== undefined) {
        attributes[`ai.request.headers.${key}`] = value;
      }
      return attributes;
    }, {} as TelemetryAttributes),
  };
}
