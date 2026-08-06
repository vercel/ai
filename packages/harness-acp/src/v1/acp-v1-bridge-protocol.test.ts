import { describe, expect, it } from 'vitest';
import {
  acpColdSessionStateSchema,
  acpRecoveryStartSchema,
} from './acp-v1-bridge-protocol';

const legacyRecoveryStart = {
  version: 1,
  configurationFingerprint: 'fingerprint',
  providerProfile: {
    type: 'ai-gateway',
    baseUrl: 'https://gateway.example',
    clientApp: 'ai-sdk/harness-acp/0.0.0-test',
    credentialSource: 'AI_GATEWAY_API_KEY',
    routeKind: 'launch',
  },
  prompt: [],
  tools: [],
  builtinTools: [],
  permissionMode: 'allow-edits',
} as const;

const providerProfile = {
  type: 'ai-gateway',
  baseUrl: 'https://gateway.example',
  credentialSource: 'AI_GATEWAY_API_KEY',
  routeKind: 'launch',
};

const legacyImplementationDefaultRecoveryStart = {
  ...legacyRecoveryStart,
  providerProfile: {
    type: 'implementation-default',
    clientApp: 'ai-sdk/harness-acp/0.0.0-test',
  },
} as const;

describe('ACP v1 bridge protocol', () => {
  it('strips legacy clientApp from recovery start state', () => {
    expect(
      acpRecoveryStartSchema.parse(legacyRecoveryStart).providerProfile,
    ).toEqual(providerProfile);
  });

  it('strips legacy clientApp from cold session state', () => {
    expect(
      acpColdSessionStateSchema.parse({
        ...legacyRecoveryStart,
        modelId: 'model-id',
      }).providerProfile,
    ).toEqual(providerProfile);
  });

  it('normalizes legacy implementation-default recovery start state', () => {
    expect(
      acpRecoveryStartSchema.parse(legacyImplementationDefaultRecoveryStart)
        .providerProfile,
    ).toEqual({ type: 'direct' });
  });

  it('normalizes legacy implementation-default cold session state', () => {
    expect(
      acpColdSessionStateSchema.parse({
        ...legacyImplementationDefaultRecoveryStart,
        modelId: 'model-id',
      }).providerProfile,
    ).toEqual({ type: 'direct' });
  });
});
