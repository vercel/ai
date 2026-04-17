import type { TelemetryIntegration } from './telemetry-integration';

/**
 * Registers one or more telemetry integrations globally.
 */
export function registerTelemetryIntegration(
  ...integrations: TelemetryIntegration[]
): void {
  if (!globalThis.AI_SDK_TELEMETRY_INTEGRATIONS) {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [];
  }
  globalThis.AI_SDK_TELEMETRY_INTEGRATIONS.push(...integrations);
}

export function getGlobalTelemetryIntegrations(): TelemetryIntegration[] {
  return globalThis.AI_SDK_TELEMETRY_INTEGRATIONS ?? [];
}
