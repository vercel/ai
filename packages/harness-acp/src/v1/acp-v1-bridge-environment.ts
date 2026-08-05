import { safeParseJSON } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type {
  ACPAuthentication,
  ACPProfileValue,
  ACPSerializableValue,
} from './acp-v1-settings';

export const ACP_BRIDGE_CONFIGURATION_ENV = 'AI_SDK_ACP_BRIDGE_CONFIGURATION';

const serializableValueSchema: z.ZodType<ACPSerializableValue> = z.json();

const profileValueSchema: z.ZodType<ACPProfileValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.object({
      $source: z.enum([
        'gateway-api-key',
        'gateway-base-url',
        'gateway-authorization',
        'client-app',
        'client-app-name',
        'client-app-version',
      ]),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
      ensureSuffix: z.string().optional(),
    }),
    z.array(profileValueSchema),
    z.record(z.string(), profileValueSchema),
  ]),
);

const serializableRecordSchema = z.record(z.string(), serializableValueSchema);
const profileRecordSchema = z.record(z.string(), profileValueSchema);

const authenticationSchema: z.ZodType<ACPAuthentication> = z.object({
  methodId: z.string(),
  meta: serializableRecordSchema.optional(),
  clientCapabilities: serializableRecordSchema.optional(),
});

const providerAuthenticationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('direct') }),
  z.object({
    type: z.literal('ai-gateway'),
    route: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('auth-method'),
        methodId: z.string(),
        env: profileRecordSchema.optional(),
        clientCapabilities: profileRecordSchema.optional(),
        meta: profileRecordSchema.optional(),
      }),
      z.object({
        type: z.literal('provider-method'),
        method: z.string(),
        advertisedCapability: z.array(z.string()).readonly(),
        env: profileRecordSchema.optional(),
        clientCapabilities: profileRecordSchema.optional(),
        params: profileRecordSchema,
      }),
      z.object({
        type: z.literal('launch'),
        env: profileRecordSchema,
      }),
      z.object({
        type: z.literal('session'),
        env: profileRecordSchema.optional(),
        meta: profileRecordSchema,
      }),
    ]),
  }),
]);

export type ACPResolvedProviderAuthentication = z.infer<
  typeof providerAuthenticationSchema
>;

export type ACPBridgeConfiguration = {
  readonly authentication?: ACPAuthentication;
  readonly providerAuthentication?: ACPResolvedProviderAuthentication;
  readonly sessionMeta?: Readonly<Record<string, ACPSerializableValue>>;
};

const bridgeConfigurationSchema: z.ZodType<ACPBridgeConfiguration> = z.object({
  authentication: authenticationSchema.optional(),
  providerAuthentication: providerAuthenticationSchema.optional(),
  sessionMeta: serializableRecordSchema.optional(),
});

export function createACPBridgeEnvironment({
  authentication,
  providerAuthentication,
  sessionMeta,
}: ACPBridgeConfiguration): Record<string, string> {
  return {
    [ACP_BRIDGE_CONFIGURATION_ENV]: JSON.stringify({
      ...(authentication == null ? {} : { authentication }),
      ...(providerAuthentication == null ? {} : { providerAuthentication }),
      ...(sessionMeta == null ? {} : { sessionMeta }),
    }),
  };
}

export async function readACPBridgeEnvironment({
  env,
}: {
  env: Readonly<Record<string, string | undefined>>;
}): Promise<ACPBridgeConfiguration> {
  const serialized = env[ACP_BRIDGE_CONFIGURATION_ENV];
  if (serialized == null) return {};
  const result = await safeParseJSON({
    text: serialized,
    schema: bridgeConfigurationSchema,
  });
  if (!result.success) {
    throw new Error('ACP bridge configuration environment is invalid.');
  }
  return result.value;
}
