import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TelemetryIntegration } from './telemetry-integration';
import {
  registerTelemetry,
  getGlobalTelemetryIntegrations,
} from './telemetry-registry';

beforeEach(() => {
  globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
});

describe('registerTelemetry', () => {
  it('adds an integration to the global registry', () => {
    const integration: TelemetryIntegration = { onStart: vi.fn() };

    registerTelemetry(integration);

    expect(getGlobalTelemetryIntegrations()).toEqual([integration]);
  });

  it('adds multiple integrations in registration order', () => {
    const integration1: TelemetryIntegration = { onStart: vi.fn() };
    const integration2: TelemetryIntegration = { onFinish: vi.fn() };

    registerTelemetry(integration1);
    registerTelemetry(integration2);

    expect(getGlobalTelemetryIntegrations()).toEqual([
      integration1,
      integration2,
    ]);
  });
});

describe('getGlobalTelemetryIntegrations', () => {
  it('returns an empty array when no integrations are registered', () => {
    expect(getGlobalTelemetryIntegrations()).toEqual([]);
  });
});
