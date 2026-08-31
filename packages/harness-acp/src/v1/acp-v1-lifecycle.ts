import type { ACPAuthenticationProfileIdentity } from '../acp-auth';
import type {
  ACPColdSessionState,
  ACPTurnStartConfig,
} from './acp-v1-bridge-protocol';

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
  readonly implementationIdentity: string;
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

export function validateACPLifecycleCompatibility({
  harnessId,
  lifecycleHarnessId,
  implementationIdentity,
  authenticationProfile,
  lifecycleData,
  sandboxId,
}: {
  harnessId: string;
  lifecycleHarnessId: string;
  implementationIdentity: string;
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
  if (lifecycleData.implementationIdentity !== implementationIdentity) {
    throw new Error(
      'ACP lifecycle state is incompatible with the configured implementation.',
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
