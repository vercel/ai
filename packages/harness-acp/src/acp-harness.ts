import type { HarnessV1 } from '@ai-sdk/harness';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  createACPAuthenticationProfileIdentity,
  resolveACPProviderAuthenticationCompatibility,
  type ACPAuthenticationProfileIdentity,
  type ACPClientApp,
} from './acp-auth';
import { createACPV1, type ACPV1Settings } from './v1';
import { createImplementationIdentity } from './v1/implementation';
import {
  acpColdSessionStateSchema,
  acpTurnStartConfigSchema,
  type ACPColdSessionState,
  type ACPTurnStartConfig,
} from './v1/acp-v1-bridge-protocol';
import { VERSION } from './version';

const ACP_CLIENT_APP = {
  name: 'ai-sdk/harness-acp',
  version: VERSION,
} as const satisfies ACPClientApp;

export type ACPHarnessSettings<TBuiltinTools extends ToolSet = {}> = {
  readonly builtinTools?: TBuiltinTools;
  readonly port?: number;
  readonly startupTimeoutMs?: number;
  readonly clientApp?: ACPClientApp;
  readonly version?: ACPV1Settings['version'];
  readonly harnessId: ACPV1Settings['harnessId'];
  readonly auth?: ACPV1Settings['auth'];
  readonly implementation: ACPV1Settings['implementation'];
  readonly authentication?: ACPV1Settings['authentication'];
  readonly providerAuthentication?: ACPV1Settings['providerAuthentication'];
  readonly modelId?: ACPV1Settings['modelId'];
  readonly permissionModeMapping?: ACPV1Settings['permissionModeMapping'];
  readonly session?: ACPV1Settings['session'];
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
      gatewayRouteKind: z
        .enum(['auth-method', 'provider-method', 'launch', 'session'])
        .optional(),
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
  recoveryStart: acpTurnStartConfigSchema.optional(),
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

type ACPBridgeCoords = z.infer<typeof acpBridgeCoordsSchema>;

export function createACP<TBuiltinTools extends ToolSet = {}>(
  settings: ACPHarnessSettings<TBuiltinTools>,
): HarnessV1<TBuiltinTools> {
  const version = (settings as { readonly version?: string }).version ?? 'v1';
  switch (version) {
    case 'v1': {
      const clientApp = settings.clientApp ?? ACP_CLIENT_APP;
      const providerAuthenticationCompatibility =
        resolveACPProviderAuthenticationCompatibility({
          auth: settings.auth,
          providerAuthentication: settings.providerAuthentication,
          env: process.env,
        });
      const implementationIdentity = createImplementationIdentity({
        harnessId: settings.harnessId,
        acpVersion: version,
        implementation: settings.implementation,
        clientApp,
        providerAuthentication: providerAuthenticationCompatibility,
        permissionModeMapping: settings.permissionModeMapping,
      });
      const authenticationProfile = createACPAuthenticationProfileIdentity({
        authentication: settings.authentication,
        providerAuthenticationCompatibility,
      });
      const lifecycleStateSchema: z.ZodType<{
        readonly implementationIdentity: string;
        readonly authenticationProfile?: ACPAuthenticationProfileIdentity;
        readonly acpSessionId?: string;
        readonly bridge?: ACPBridgeCoords;
        readonly coldSession?: ACPColdSessionState;
        readonly turnStartConfig?: ACPTurnStartConfig;
        readonly recovery?: {
          readonly mode: 'disk-replay' | 'lossy-rerun';
          readonly reason: string;
        };
        readonly restoration?: {
          readonly method: 'resume' | 'load';
        };
        readonly initialGuidanceApplied?: boolean;
        readonly skillsMaterialized?: boolean;
        readonly skillsFingerprint?: string;
      }> = acpResumeStateSchema
        .extend({
          implementationIdentity: z.literal(implementationIdentity),
          authenticationProfile:
            acpResumeStateSchema.shape.authenticationProfile
              .unwrap()
              .extend({
                digest: z.literal(authenticationProfile.digest),
              })
              .optional(),
        })
        .transform(({ recoveryStart, ...lifecycleData }) =>
          lifecycleData.turnStartConfig != null || recoveryStart == null
            ? lifecycleData
            : { ...lifecycleData, turnStartConfig: recoveryStart },
        );
      return createACPV1({
        settings,
        builtinTools:
          settings.builtinTools ?? (ACP_BUILTIN_TOOLS as TBuiltinTools),
        port: settings.port,
        startupTimeoutMs: settings.startupTimeoutMs,
        clientApp,
        implementationIdentity,
        authenticationProfile,
        providerAuthenticationCompatibility,
        lifecycleStateSchema,
      });
    }
    default:
      throw new Error(
        `Unsupported ACP protocol version ${JSON.stringify(version)}. Supported versions: "v1".`,
      );
  }
}
