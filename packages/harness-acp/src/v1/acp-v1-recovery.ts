import { createHash } from 'node:crypto';
import type { HarnessV1DebugConfig } from '@ai-sdk/harness';
import type {
  ACPAuthenticationProfileIdentity,
  ACPProviderAuthenticationCompatibility,
} from '../acp-auth';
import type {
  ACPColdSessionState,
  ACPRecoveryJSONValue,
  ACPRecoveryStart,
  StartMessage,
} from './acp-v1-bridge-protocol';
import type { ACPTextContentBlock } from './acp-v1-prompt';
import type {
  ACPPermissionModeMapping,
  ACPSerializableValue,
} from './acp-v1-settings';

export function createACPRecoveryStart({
  prompt,
  tools,
  builtinTools,
  permissionMode,
  permissionModeMapping,
  debug,
  authenticationProfile,
  providerAuthenticationCompatibility,
  sessionMeta,
}: {
  prompt: ReadonlyArray<ACPTextContentBlock>;
  tools: ReadonlyArray<{
    readonly name: string;
    readonly description?: string;
    readonly inputSchema?: unknown;
  }>;
  builtinTools: StartMessage['builtinTools'];
  permissionMode: NonNullable<StartMessage['permissionMode']>;
  permissionModeMapping: ACPPermissionModeMapping | undefined;
  debug: HarnessV1DebugConfig | undefined;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  providerAuthenticationCompatibility:
    | ACPProviderAuthenticationCompatibility
    | undefined;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
}): ACPRecoveryStart {
  return {
    version: 1,
    configurationFingerprint: createHash('sha256')
      .update(
        stableStringify({
          authenticationProfile,
          sessionMeta: sessionMeta ?? null,
          builtinTools,
          permissionModeMapping: permissionModeMapping ?? null,
        }),
      )
      .digest('hex'),
    providerProfile: createProviderProfile({
      compatibility: providerAuthenticationCompatibility,
    }),
    prompt: [...prompt],
    tools: tools.map(tool => ({
      name: tool.name,
      ...(tool.description == null ? {} : { description: tool.description }),
      ...(tool.inputSchema == null
        ? {}
        : { inputSchema: tool.inputSchema as ACPRecoveryJSONValue }),
    })),
    builtinTools: [...builtinTools],
    permissionMode,
    ...(permissionModeMapping == null ? {} : { permissionModeMapping }),
    ...(debug == null ? {} : { debug }),
  };
}

export function createACPColdSessionState({
  recoveryStart,
  modelId,
}: {
  recoveryStart: ACPRecoveryStart;
  modelId: string | undefined;
}): ACPColdSessionState {
  return {
    version: recoveryStart.version,
    configurationFingerprint: recoveryStart.configurationFingerprint,
    providerProfile: recoveryStart.providerProfile,
    tools: recoveryStart.tools,
    builtinTools: recoveryStart.builtinTools,
    permissionMode: recoveryStart.permissionMode,
    ...(recoveryStart.permissionModeMapping == null
      ? {}
      : { permissionModeMapping: recoveryStart.permissionModeMapping }),
    ...(modelId == null ? {} : { modelId }),
  };
}

function createProviderProfile({
  compatibility,
}: {
  compatibility: ACPProviderAuthenticationCompatibility | undefined;
}): ACPRecoveryStart['providerProfile'] {
  if (compatibility == null || compatibility.type === 'direct') {
    return { type: 'direct' };
  }
  if (compatibility.credentialSource == null) {
    throw new Error(
      'ACP recovery cannot persist an AI Gateway profile without a credential source.',
    );
  }
  return {
    type: 'ai-gateway',
    baseUrl: compatibility.baseUrl,
    credentialSource: compatibility.credentialSource,
    routeKind: compatibility.route.type,
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sortValue(item));
  }
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, sortValue(entry)]),
    );
  }
  return value;
}
