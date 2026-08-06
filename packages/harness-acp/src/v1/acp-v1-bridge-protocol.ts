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
import type { ACPPermissionModeMapping } from './acp-v1-settings';
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
   * JSON Schema used to identify tool calls when an ACP implementation does
   * not provide a programmatic tool name. It is optional because built-in
   * definitions are allowed to omit their input schema.
   */
  readonly inputSchema?: HarnessV1LifecycleState['data'];
};

const builtinToolSchema: z.ZodType<ACPBuiltinToolMapping> = z.object({
  toolName: z.string(),
  nativeName: z.string().optional(),
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
    'allow-reads': permissionModeTargetSchema,
    'allow-edits': permissionModeTargetSchema,
    'allow-all': permissionModeTargetSchema,
  });

export type ACPTurnStartConfig = {
  readonly version: 1;
  readonly configurationFingerprint: string;
  readonly prompt: Array<z.infer<typeof acpTextContentBlockSchema>>;
  readonly tools: Array<ACPSerializableToolSpec>;
  readonly builtinTools: Array<ACPBuiltinToolMapping>;
  readonly permissionMode: HarnessV1PermissionMode;
  readonly permissionModeMapping?: ACPPermissionModeMapping;
  readonly debug?: HarnessV1DebugConfig;
};

export const acpTurnStartConfigSchema = z.object({
  version: z.literal(1),
  configurationFingerprint: z.string(),
  prompt: z.array(acpTextContentBlockSchema),
  tools: z.array(acpSerializableToolSpecSchema).default([]),
  builtinTools: z.array(builtinToolSchema).default([]),
  permissionMode: harnessV1BridgeStartBaseSchema.shape.permissionMode.unwrap(),
  permissionModeMapping: permissionModeMappingSchema.optional(),
  debug: harnessV1BridgeStartBaseSchema.shape.debug.optional(),
}) satisfies z.ZodType<ACPTurnStartConfig>;

export type ACPColdSessionState = Omit<
  ACPTurnStartConfig,
  'prompt' | 'debug'
> & {
  readonly modelId?: string;
};

export const acpColdSessionStateSchema: z.ZodType<ACPColdSessionState> =
  acpTurnStartConfigSchema.omit({ prompt: true, debug: true }).extend({
    modelId: z.string().optional(),
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

export const outboundMessageSchema = harnessV1BridgeOutboundMessageSchema;
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

export const startMessageSchema = harnessV1BridgeStartBaseSchema.extend({
  prompt: z.array(acpTextContentBlockSchema),
  tools: z.array(acpSerializableToolSpecSchema).optional(),
  builtinTools: z.array(builtinToolSchema).readonly().default([]),
  permissionModeMapping: permissionModeMappingSchema.optional(),
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
