import { createHash } from 'node:crypto';
import type {
  ACPAuthenticationProfileIdentity,
  ACPClientApp,
  ACPProviderAuthenticationCompatibility,
} from '../acp-auth';
import type {
  ACPColdSessionState,
  ACPTurnStartConfig,
} from './acp-v1-bridge-protocol';
import type { ACPV1Settings } from './acp-v1-settings';
import { canonicalFingerprint } from './bridge/canonical-json-fingerprint';

export type ACPPromptGuidanceLifecycleState = {
  readonly initialGuidanceApplied?: boolean;
  readonly instructionsFingerprint?: string;
  readonly skillsDirectory?: string;
};

export type ACPBridgeCoordinates = {
  readonly port: number;
  readonly token: string;
  readonly lastSeenEventId: number;
  readonly sandboxId?: string;
  readonly stateDir?: string;
};

export type ACPLifecycleData = ACPPromptGuidanceLifecycleState & {
  readonly agentIdentity: string;
  readonly authenticationProfile?: ACPAuthenticationProfileIdentity;
  readonly sandboxCredentialEnvironment?: Readonly<Record<string, string>>;
  readonly acpSessionId?: string;
  readonly bridge?: ACPBridgeCoordinates;
  readonly coldSession?: ACPColdSessionState;
  readonly turnStartConfig?: ACPTurnStartConfig;
  readonly recovery?: {
    readonly mode: 'disk-replay' | 'lossy-rerun';
    readonly reason: string;
  };
  readonly restoration?: {
    readonly method: 'resume' | 'load';
  };
};

export function resolveACPInitialGuidanceApplied({
  isResume,
  lifecycleState,
}: {
  isResume: boolean;
  lifecycleState: ACPPromptGuidanceLifecycleState | undefined;
}): boolean {
  if (!isResume) return false;
  return lifecycleState?.initialGuidanceApplied ?? true;
}

/*
 * Digest of every non-secret input that determines how the ACP agent is
 * installed, launched, and configured. Lifecycle state produced under one
 * identity cannot be resumed under another because the agent's persisted
 * session may depend on any of these inputs.
 */
export function createACPAgentIdentity({
  settings,
  clientApp,
  providerAuthentication,
}: {
  settings: ACPV1Settings;
  clientApp: ACPClientApp;
  providerAuthentication: ACPProviderAuthenticationCompatibility | undefined;
}): string {
  const payload = {
    harnessId: settings.harnessId,
    acpVersion: 'v1',
    source: settings.source,
    executable: settings.executable,
    args: settings.args ?? [],
    clientApp,
    clientCapabilities: settings.clientCapabilities ?? null,
    modelMapping: settings.modelMapping,
    environment: {
      forwarded: [...new Set(settings.forwardEnv)].sort(),
      credential: [...new Set(settings.credentialEnv)].sort(),
      literal: settings.env ?? {},
    },
    providerAuthentication: providerAuthentication ?? null,
    permissionModeMapping: settings.permissionModeMapping ?? null,
    nonTextContentTypes: [...new Set(settings.nonTextContentTypes)].sort(),
  };
  return createHash('sha256')
    .update(canonicalFingerprint({ value: payload }))
    .digest('hex');
}

export function validateACPLifecycleCompatibility({
  harnessId,
  lifecycleHarnessId,
  agentIdentity,
  authenticationProfile,
  lifecycleData,
  sandboxId,
}: {
  harnessId: string;
  lifecycleHarnessId: string;
  agentIdentity: string;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  lifecycleData: ACPLifecycleData;
  sandboxId: string | undefined;
}): void {
  if (lifecycleHarnessId !== harnessId) {
    throw new Error(
      `ACP lifecycle state was produced by harness ${JSON.stringify(
        lifecycleHarnessId,
      )}, but this harness is ${JSON.stringify(harnessId)}.`,
    );
  }
  if (lifecycleData.agentIdentity !== agentIdentity) {
    throw new Error(
      'ACP lifecycle state is incompatible with the configured agent.',
    );
  }
  if (
    lifecycleData.authenticationProfile?.digest !== authenticationProfile.digest
  ) {
    throw new Error(
      'ACP lifecycle state is incompatible with the configured authentication profile.',
    );
  }
  const expectedSandboxId = lifecycleData.bridge?.sandboxId;
  if (
    expectedSandboxId != null &&
    sandboxId != null &&
    expectedSandboxId !== sandboxId
  ) {
    throw new Error(
      `ACP lifecycle state belongs to sandbox ${JSON.stringify(
        expectedSandboxId,
      )}, not ${JSON.stringify(sandboxId)}.`,
    );
  }
}
