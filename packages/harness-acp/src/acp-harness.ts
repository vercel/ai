import type { HarnessV1 } from '@ai-sdk/harness';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { ACPClientApp } from './acp-auth';
import type { ACPToolCall } from './acp-tool-call';
import { createACPV1, type ACPV1Settings } from './v1';
import {
  acpColdSessionStateSchema,
  acpTurnStartConfigSchema,
} from './v1/acp-v1-bridge-protocol';
import { VERSION } from './version';

const ACP_CLIENT_APP = {
  name: 'ai-sdk/harness-acp',
  version: VERSION,
} as const satisfies ACPClientApp;

export type ACPHarnessSettings<TBuiltinTools extends ToolSet = {}> = {
  readonly builtinTools?: TBuiltinTools;
  /**
   * MCP server definitions keyed by server name. Each definition uses the
   * underlying runtime's native MCP server configuration format.
   */
  readonly mcpServers?: Record<string, unknown>;
  readonly isMcpToolCall?: (toolCall: ACPToolCall) => boolean;
  readonly port?: number;
  readonly startupTimeoutMs?: number;
  readonly clientApp?: ACPClientApp;
  readonly version?: ACPV1Settings['version'];
  readonly harnessId: ACPV1Settings['harnessId'];
  readonly auth?: ACPV1Settings['auth'];
  readonly source: ACPV1Settings['source'];
  readonly executable: ACPV1Settings['executable'];
  readonly args?: ACPV1Settings['args'];
  readonly forwardEnv?: ACPV1Settings['forwardEnv'];
  readonly env?: ACPV1Settings['env'];
  readonly authentication?: ACPV1Settings['authentication'];
  readonly providerAuthentication?: ACPV1Settings['providerAuthentication'];
  readonly modelId?: ACPV1Settings['modelId'];
  readonly instructionMapping?: ACPV1Settings['instructionMapping'];
  readonly permissionModeMapping?: ACPV1Settings['permissionModeMapping'];
  readonly session?: ACPV1Settings['session'];
  readonly mintBridgeToken?: ACPV1Settings['mintBridgeToken'];
};

const ACP_BUILTIN_TOOLS = {} as const satisfies ToolSet;

const acpBridgeCoordsSchema = z.object({
  port: z.number(),
  token: z.string(),
  lastSeenEventId: z.number(),
  sandboxId: z.string().optional(),
  stateDir: z.string().optional(),
});

const acpResumeStateSchema = z.object({
  implementationIdentity: z.string(),
  authenticationProfile: z
    .object({
      digest: z.string(),
      acpMethodId: z.string().optional(),
      providerKind: z
        .enum(['implementation-default', 'direct', 'ai-gateway'])
        .transform(value =>
          value === 'implementation-default' ? 'direct' : value,
        ),
      providerMode: z.enum(['auto', 'direct', 'ai-gateway']).optional(),
      gatewayCredentialSource: z
        .enum(['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN'])
        .nullable()
        .optional(),
    })
    .optional(),
  acpSessionId: z.string().optional(),
  bridge: acpBridgeCoordsSchema.optional(),
  coldSession: acpColdSessionStateSchema.optional(),
  turnStartConfig: acpTurnStartConfigSchema.optional(),
  recovery: z
    .object({
      mode: z.enum(['disk-replay', 'lossy-rerun']),
      reason: z.string(),
    })
    .optional(),
  restoration: z
    .object({
      method: z.enum(['resume', 'load']),
    })
    .optional(),
  initialGuidanceApplied: z.boolean().optional(),
  skillsMaterialized: z.boolean().optional(),
  skillsFingerprint: z.string().optional(),
});

export function createACP<TBuiltinTools extends ToolSet = {}>(
  settings: ACPHarnessSettings<TBuiltinTools>,
): HarnessV1<TBuiltinTools> {
  if (
    settings.mcpServers != null &&
    Object.prototype.hasOwnProperty.call(
      settings.mcpServers,
      'ai-sdk-harness-tools',
    )
  ) {
    throw new Error(
      'ACP MCP server name "ai-sdk-harness-tools" is reserved for HarnessAgent tools.',
    );
  }
  const version = (settings as { readonly version?: string }).version ?? 'v1';
  switch (version) {
    case 'v1': {
      const clientApp = settings.clientApp ?? ACP_CLIENT_APP;
      return createACPV1({
        settings,
        builtinTools:
          settings.builtinTools ?? (ACP_BUILTIN_TOOLS as TBuiltinTools),
        port: settings.port,
        startupTimeoutMs: settings.startupTimeoutMs,
        clientApp,
        lifecycleStateSchema: acpResumeStateSchema,
      });
    }
    default:
      throw new Error(
        `Unsupported ACP protocol version ${JSON.stringify(version)}. Supported versions: "v1".`,
      );
  }
}
