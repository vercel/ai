import {
  harnessV1BridgeInboundCommandSchemas,
  harnessV1BridgeOutboundMessageSchema,
  harnessV1BridgeReadySchema,
  harnessV1BridgeStartBaseSchema,
  type HarnessV1DebugConfig,
  type HarnessV1PermissionMode,
} from '@ai-sdk/harness';
import { z } from 'zod/v4';
import type { ACPPermissionModeMapping } from './acp-v1-settings';
import { acpTextContentBlockSchema } from './acp-v1-prompt';

const builtinToolSchema = z.object({
  toolName: z.string(),
  nativeName: z.string().optional(),
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

export type ACPRecoveryJSONValue =
  | string
  | number
  | boolean
  | null
  | ACPRecoveryJSONValue[]
  | { [key: string]: ACPRecoveryJSONValue };

export type ACPRecoveryStart = {
  readonly version: 1;
  readonly configurationFingerprint: string;
  readonly providerProfile:
    | {
        readonly type: 'direct';
      }
    | {
        readonly type: 'ai-gateway';
        readonly baseUrl: string;
        readonly credentialSource: 'AI_GATEWAY_API_KEY' | 'VERCEL_OIDC_TOKEN';
        readonly routeKind:
          | 'auth-method'
          | 'provider-method'
          | 'launch'
          | 'session';
      };
  readonly prompt: Array<z.infer<typeof acpTextContentBlockSchema>>;
  readonly tools: Array<{
    readonly name: string;
    readonly description?: string;
    readonly inputSchema?: ACPRecoveryJSONValue;
  }>;
  readonly builtinTools: Array<z.infer<typeof builtinToolSchema>>;
  readonly permissionMode: HarnessV1PermissionMode;
  readonly permissionModeMapping?: ACPPermissionModeMapping;
  readonly debug?: HarnessV1DebugConfig;
};

export const acpRecoveryStartSchema = z.object({
  version: z.literal(1),
  configurationFingerprint: z.string(),
  providerProfile: z.union([
    z
      .object({
        type: z.literal('implementation-default'),
      })
      .transform(() => ({ type: 'direct' }) as const),
    z.object({
      type: z.literal('direct'),
    }),
    z.object({
      type: z.literal('ai-gateway'),
      baseUrl: z.string(),
      credentialSource: z.enum(['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN']),
      routeKind: z.enum([
        'auth-method',
        'provider-method',
        'launch',
        'session',
      ]),
    }),
  ]),
  prompt: z.array(acpTextContentBlockSchema),
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        inputSchema: z.json().optional(),
      }),
    )
    .default([]),
  builtinTools: z.array(builtinToolSchema).default([]),
  permissionMode: harnessV1BridgeStartBaseSchema.shape.permissionMode.unwrap(),
  permissionModeMapping: permissionModeMappingSchema.optional(),
  debug: harnessV1BridgeStartBaseSchema.shape.debug.optional(),
}) satisfies z.ZodType<ACPRecoveryStart>;

export type ACPColdSessionState = Omit<ACPRecoveryStart, 'prompt' | 'debug'> & {
  readonly modelId?: string;
};

export const acpColdSessionStateSchema: z.ZodType<ACPColdSessionState> =
  acpRecoveryStartSchema.omit({ prompt: true, debug: true }).extend({
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
  builtinTools: z.array(builtinToolSchema).readonly().default([]),
  permissionModeMapping: permissionModeMappingSchema.optional(),
  recovery: acpRecoveryStartSchema,
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
