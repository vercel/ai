import { createHash } from 'node:crypto';
import type { HarnessV1DebugConfig } from '@ai-sdk/harness';
import type { ACPAuthenticationProfileIdentity } from '../acp-auth';
import type {
  ACPColdSessionState,
  ACPTurnStartConfig,
  ACPTurnStartJSONValue,
  StartMessage,
} from './acp-v1-bridge-protocol';
import type { ACPTextContentBlock } from './acp-v1-prompt';
import type {
  ACPPermissionModeMapping,
  ACPSerializableValue,
} from './acp-v1-settings';

export function createACPTurnStartConfig({
  prompt,
  tools,
  builtinTools,
  permissionMode,
  permissionModeMapping,
  debug,
  authenticationProfile,
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
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
}): ACPTurnStartConfig {
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
    prompt: [...prompt],
    tools: tools.map(tool => ({
      name: tool.name,
      ...(tool.description == null ? {} : { description: tool.description }),
      ...(tool.inputSchema == null
        ? {}
        : { inputSchema: tool.inputSchema as ACPTurnStartJSONValue }),
    })),
    builtinTools: [...builtinTools],
    permissionMode,
    ...(permissionModeMapping == null ? {} : { permissionModeMapping }),
    ...(debug == null ? {} : { debug }),
  };
}

export function createACPColdSessionState({
  turnStartConfig,
  modelId,
}: {
  turnStartConfig: ACPTurnStartConfig;
  modelId: string | undefined;
}): ACPColdSessionState {
  return {
    version: turnStartConfig.version,
    configurationFingerprint: turnStartConfig.configurationFingerprint,
    tools: turnStartConfig.tools,
    builtinTools: turnStartConfig.builtinTools,
    permissionMode: turnStartConfig.permissionMode,
    ...(turnStartConfig.permissionModeMapping == null
      ? {}
      : { permissionModeMapping: turnStartConfig.permissionModeMapping }),
    ...(modelId == null ? {} : { modelId }),
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
