import type { Telemetry } from './telemetry-integration';

/**
 * Registers a telemetry integration globally.
 */
export function registerTelemetry(integration: Telemetry): void {
  if (!globalThis.AI_SDK_TELEMETRY_INTEGRATIONS) {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [];
  }
  globalThis.AI_SDK_TELEMETRY_INTEGRATIONS.push(integration);
}

export function getGlobalTelemetryIntegrations(): Telemetry[] {
  return globalThis.AI_SDK_TELEMETRY_INTEGRATIONS ?? [];
}
