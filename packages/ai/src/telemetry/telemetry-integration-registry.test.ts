import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TelemetryIntegration } from './telemetry-integration';
import {
  registerTelemetryIntegration,
  getGlobalTelemetryIntegrations,
} from './telemetry-integration-registry';

beforeEach(() => {
  globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
});

describe('registerTelemetryIntegration', () => {
  it('adds an integration to the global registry', () => {
    const integration: TelemetryIntegration = { onStart: vi.fn() };

    registerTelemetryIntegration(integration);

    expect(getGlobalTelemetryIntegrations()).toEqual([integration]);
  });

  it('adds multiple integrations in registration order', () => {
    const integration1: TelemetryIntegration = { onStart: vi.fn() };
    const integration2: TelemetryIntegration = { onFinish: vi.fn() };

    registerTelemetryIntegration(integration1);
    registerTelemetryIntegration(integration2);

    expect(getGlobalTelemetryIntegrations()).toEqual([
      integration1,
      integration2,
    ]);
  });

  it('adds multiple integrations passed in a single call', () => {
    const integration1: TelemetryIntegration = { onStart: vi.fn() };
    const integration2: TelemetryIntegration = { onFinish: vi.fn() };
    const integration3: TelemetryIntegration = { onError: vi.fn() };

    registerTelemetryIntegration(integration1, integration2, integration3);

    expect(getGlobalTelemetryIntegrations()).toEqual([
      integration1,
      integration2,
      integration3,
    ]);
  });

  it('is a no-op when called with no integrations', () => {
    registerTelemetryIntegration();

    expect(getGlobalTelemetryIntegrations()).toEqual([]);
  });
});

describe('getGlobalTelemetryIntegrations', () => {
  it('returns an empty array when no integrations are registered', () => {
    expect(getGlobalTelemetryIntegrations()).toEqual([]);
  });
});
