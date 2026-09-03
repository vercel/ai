import {
  harnessV1BridgeInboundCommandSchemas,
  harnessV1BridgeOutboundMessageSchema,
  harnessV1BridgeReadySchema,
  harnessV1BridgeStartBaseSchema,
  harnessV1BridgeToolWireSchema,
  type HarnessV1BuiltinTool,
  type HarnessV1DebugConfig,
  type HarnessV1LifecycleState,
  type HarnessV1PermissionMode,
  type HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import { z } from 'zod/v4';
import type { ACPToolCall } from '../acp-tool-call';
import type {
  ACPInstructionMapping,
  ACPModelMapping,
  ACPPermissionModeMapping,
} from './acp-v1-settings';
import { acpTextContentBlockSchema } from './acp-v1-prompt';

export type ACPBuiltinToolMapping = {
  /**
   * Key of the tool in `HarnessV1.builtinTools`, which is also emitted as the
   * Harness V1 `toolName`. It is the common tool name when the tool has a
   * standardized Harness V1 equivalent; otherwise it is the native tool name.
   */
  readonly toolName: string;

  /**
   * Name used by the underlying agent runtime. It is present when `toolName`
   * is a Harness V1 common tool name that differs from the runtime's name.
   */
  readonly nativeName?: HarnessV1BuiltinTool['nativeName'];

  /**
   * Stable prefix of the display title emitted by an ACP implementation.
   * Used only when the implementation omits a programmatic tool name.
   */
  readonly title?: HarnessV1BuiltinTool['title'];

  /**
   * Broad capability category used to compare a built-in with the ACP tool
   * kind when resolving unnamed calls.
   */
  readonly toolUseKind?: HarnessV1BuiltinTool['toolUseKind'];

  /**
   * JSON Schema used to identify tool calls when an ACP implementation does
   * not provide a programmatic tool name. It is optional because built-in
   * definitions are allowed to omit their input schema.
   */
  readonly inputSchema?: HarnessV1LifecycleState['data'];
};

const builtinToolSchema: z.ZodType<ACPBuiltinToolMapping> = z.object({
  toolName: z.string(),
  nativeName: z.string().optional(),
  title: z.string().optional(),
  toolUseKind: z.enum(['readonly', 'edit', 'bash']).optional(),
  inputSchema: z.json().optional(),
});

type ACPSerializableToolSpec = Omit<HarnessV1ToolSpec, 'inputSchema'> & {
  readonly inputSchema?: NonNullable<HarnessV1ToolSpec['inputSchema']> &
    HarnessV1LifecycleState['data'];
};

const jsonValueSchema = z.json();

export const acpSerializableToolSpecSchema: z.ZodType<ACPSerializableToolSpec> =
  harnessV1BridgeToolWireSchema.extend({
    inputSchema: z
      .custom<NonNullable<ACPSerializableToolSpec['inputSchema']>>(
        value =>
          value != null &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          jsonValueSchema.safeParse(value).success,
      )
      .optional(),
  });

const permissionModeTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session-mode'),
    modeId: z.string(),
  }),
  z.object({
    type: z.literal('session-config-option'),
    configId: z.string(),
    value: z.union([z.string(), z.boolean()]),
  }),
]);

const permissionModeMappingSchema: z.ZodType<ACPPermissionModeMapping> =
  z.object({
    'allow-reads': permissionModeTargetSchema.nullable(),
    'allow-edits': permissionModeTargetSchema.nullable(),
    'allow-all': permissionModeTargetSchema.nullable(),
  });

const instructionMappingPathSchema = z.array(z.string().min(1)).min(1);

const instructionMappingSchema: z.ZodType<ACPInstructionMapping> =
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('session-meta'),
      path: instructionMappingPathSchema,
    }),
    z.object({
      type: z.literal('launch-env-json'),
      variable: z.string().min(1),
      path: instructionMappingPathSchema,
    }),
  ]);

type ACPSerializableOutputSchemaMapping = {
  readonly type: 'session-prompt-meta';
  readonly path: string[];
};

const outputSchemaMappingSchema: z.ZodType<ACPSerializableOutputSchemaMapping> =
  z.object({
    type: z.literal('session-prompt-meta'),
    path: z.array(z.string().min(1)).min(1),
  });

const modelMappingSchema: z.ZodType<ACPModelMapping> = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('session-config-option'),
      path: z.string().min(1),
    }),
    z.object({
      type: z.literal('session-model'),
      path: z.string().min(1),
    }),
  ],
);

export type ACPTurnStartConfig = {
  readonly version: 1;
  readonly configurationFingerprint: string;
  readonly prompt: Array<z.infer<typeof acpTextContentBlockSchema>>;
  readonly tools: Array<ACPSerializableToolSpec>;
  readonly builtinTools: Array<ACPBuiltinToolMapping>;
  readonly permissionMode: HarnessV1PermissionMode;
  readonly permissionModeMapping?: ACPPermissionModeMapping;
  readonly model?: string;
  readonly modelMapping?: ACPModelMapping;
  readonly debug?: HarnessV1DebugConfig;
  readonly responseFormat?: z.infer<
    typeof harnessV1BridgeStartBaseSchema
  >['responseFormat'];
  readonly outputSchemaMapping?: ACPSerializableOutputSchemaMapping;
};

export const acpTurnStartConfigSchema = z.object({
  version: z.literal(1),
  configurationFingerprint: z.string(),
  prompt: z.array(acpTextContentBlockSchema),
  tools: z.array(acpSerializableToolSpecSchema).default([]),
  builtinTools: z.array(builtinToolSchema).default([]),
  permissionMode: harnessV1BridgeStartBaseSchema.shape.permissionMode.unwrap(),
  permissionModeMapping: permissionModeMappingSchema.optional(),
  model: harnessV1BridgeStartBaseSchema.shape.model.optional(),
  modelMapping: modelMappingSchema.optional(),
  debug: harnessV1BridgeStartBaseSchema.shape.debug.optional(),
  responseFormat:
    harnessV1BridgeStartBaseSchema.shape.responseFormat.optional(),
  outputSchemaMapping: outputSchemaMappingSchema.optional(),
}) satisfies z.ZodType<ACPTurnStartConfig>;

export type ACPColdSessionState = Omit<
  ACPTurnStartConfig,
  'prompt' | 'debug' | 'model' | 'modelMapping'
>;

export const acpColdSessionStateSchema: z.ZodType<ACPColdSessionState> =
  acpTurnStartConfigSchema.omit({
    prompt: true,
    debug: true,
    model: true,
    modelMapping: true,
  });

const lossyRecoverySchema = z.object({
  type: z.literal('lossy-rerun'),
  acpSessionId: z.string(),
  reason: z.string(),
});

const coldRestoreSchema = z.object({
  type: z.literal('cold-restore'),
  acpSessionId: z.string(),
});

const acpToolCallCandidateSchema = z.object({
  type: z.literal('acp-tool-call-candidate'),
  requestId: z.string(),
  toolCall: z.custom<ACPToolCall>(
    value =>
      value != null &&
      typeof value === 'object' &&
      typeof (value as { toolCallId?: unknown }).toolCallId === 'string' &&
      typeof (value as { title?: unknown }).title === 'string',
  ),
});

const acpQuestionRequestSchema = z.object({
  type: z.literal('acp-question-request'),
  requestId: z.string(),
  nativeRequest: z.unknown(),
  nativeToolCall: acpToolCallCandidateSchema.shape.toolCall.optional(),
});

const acpQuestionResolvedSchema = z.object({
  type: z.literal('acp-question-resolved'),
  requestId: z.string(),
});

export const outboundMessageSchema = z.union([
  harnessV1BridgeOutboundMessageSchema,
  acpToolCallCandidateSchema,
  acpQuestionRequestSchema,
  acpQuestionResolvedSchema,
]);
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

export const startMessageSchema = harnessV1BridgeStartBaseSchema.extend({
  prompt: z.array(acpTextContentBlockSchema),
  instructions: z.string().optional(),
  instructionMapping: instructionMappingSchema.optional(),
  outputSchemaMapping: outputSchemaMappingSchema.optional(),
  mcpServers: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(acpSerializableToolSpecSchema).optional(),
  builtinTools: z.array(builtinToolSchema).readonly().default([]),
  permissionModeMapping: permissionModeMappingSchema.optional(),
  modelMapping: modelMappingSchema.optional(),
  turnStartConfig: acpTurnStartConfigSchema,
  recoveryMode: z
    .discriminatedUnion('type', [lossyRecoverySchema, coldRestoreSchema])
    .optional(),
});
export type StartMessage = z.infer<typeof startMessageSchema>;

export const inboundMessageSchema = z.discriminatedUnion('type', [
  startMessageSchema,
  ...harnessV1BridgeInboundCommandSchemas,
]);
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const bridgeReadySchema = harnessV1BridgeReadySchema;
export type BridgeReady = z.infer<typeof bridgeReadySchema>;
