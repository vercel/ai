import { createHash } from 'node:crypto';
import type { HarnessV1DebugConfig, HarnessV1ToolSpec } from '@ai-sdk/harness';
import type { ACPAuthenticationProfileIdentity } from '../acp-auth';
import {
  acpSerializableToolSpecSchema,
  type ACPBuiltinToolMapping,
  type ACPColdSessionState,
  type ACPTurnStartConfig,
  type StartMessage,
} from './acp-v1-bridge-protocol';
import type { ACPTextContentBlock } from './acp-v1-prompt';
import type {
  ACPInstructionMapping,
  ACPModelMapping,
  ACPOutputSchemaMapping,
  ACPPermissionModeMapping,
  ACPSerializableValue,
} from './acp-v1-settings';

export function createACPTurnStartConfig({
  prompt,
  tools,
  builtinTools,
  permissionMode,
  permissionModeMapping,
  mcpServers,
  debug,
  authenticationProfile,
  sessionMeta,
  instructionMapping,
  responseFormat,
  outputSchemaMapping,
  model,
  modelMapping,
}: {
  prompt: ReadonlyArray<ACPTextContentBlock>;
  tools: ReadonlyArray<HarnessV1ToolSpec>;
  builtinTools: ReadonlyArray<ACPBuiltinToolMapping>;
  permissionMode: NonNullable<StartMessage['permissionMode']>;
  permissionModeMapping: ACPPermissionModeMapping | undefined;
  mcpServers: Record<string, unknown> | undefined;
  debug: HarnessV1DebugConfig | undefined;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  instructionMapping: ACPInstructionMapping | undefined;
  responseFormat: StartMessage['responseFormat'];
  outputSchemaMapping: ACPOutputSchemaMapping | undefined;
  model: string | undefined;
  modelMapping: ACPModelMapping;
}): ACPTurnStartConfig {
  return {
    version: 1,
    configurationFingerprint: createHash('sha256')
      .update(
        stableStringify({
          authenticationProfile,
          sessionMeta: sessionMeta ?? null,
          ...(instructionMapping == null ? {} : { instructionMapping }),
          ...(outputSchemaMapping == null ? {} : { outputSchemaMapping }),
          modelMapping,
          builtinTools,
          permissionModeMapping: permissionModeMapping ?? null,
          mcpServers: mcpServers ?? null,
        }),
      )
      .digest('hex'),
    prompt: [...prompt],
    tools: tools.map(tool => acpSerializableToolSpecSchema.parse(tool)),
    builtinTools: [...builtinTools],
    permissionMode,
    ...(model == null ? {} : { model, modelMapping }),
    ...(responseFormat == null ? {} : { responseFormat }),
    ...(outputSchemaMapping == null
      ? {}
      : {
          outputSchemaMapping: {
            type: outputSchemaMapping.type,
            path: [...outputSchemaMapping.path],
          },
        }),
    ...(permissionModeMapping == null ? {} : { permissionModeMapping }),
    ...(debug == null ? {} : { debug }),
  };
}

export function createACPColdSessionState({
  turnStartConfig,
}: {
  turnStartConfig: ACPTurnStartConfig;
}): ACPColdSessionState {
  return {
    version: turnStartConfig.version,
    configurationFingerprint: turnStartConfig.configurationFingerprint,
    tools: turnStartConfig.tools,
    builtinTools: turnStartConfig.builtinTools,
    permissionMode: turnStartConfig.permissionMode,
    ...(turnStartConfig.responseFormat == null
      ? {}
      : { responseFormat: turnStartConfig.responseFormat }),
    ...(turnStartConfig.outputSchemaMapping == null
      ? {}
      : { outputSchemaMapping: turnStartConfig.outputSchemaMapping }),
    ...(turnStartConfig.permissionModeMapping == null
      ? {}
      : { permissionModeMapping: turnStartConfig.permissionModeMapping }),
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
