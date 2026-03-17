import type { TelemetryIntegration } from './telemetry-integration';

/**
 * Registers a telemetry integration globally.
 */
export function registerTelemetryIntegration(
  integration: TelemetryIntegration,
): void {
  if (!globalThis.AI_SDK_TELEMETRY_INTEGRATIONS) {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [];
  }
  globalThis.AI_SDK_TELEMETRY_INTEGRATIONS.push(integration);
}

export function getGlobalTelemetryIntegrations(): TelemetryIntegration[] {
  return globalThis.AI_SDK_TELEMETRY_INTEGRATIONS ?? [];
}

// TODO remove when OTel is moved to a separate package
export function hasIntegration(integration: TelemetryIntegration): boolean {
  return (globalThis.AI_SDK_TELEMETRY_INTEGRATIONS ?? []).includes(integration);
}
