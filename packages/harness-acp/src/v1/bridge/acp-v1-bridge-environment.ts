import { z } from 'zod/v4';
import type {
  ACPAuthentication,
  ACPProfileValue,
  ACPSerializableValue,
} from '../acp-v1-settings';

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
    env: profileRecordSchema,
  }),
]);

export type ACPResolvedProviderAuthentication = z.infer<
  typeof providerAuthenticationSchema
>;

export type ACPBridgeConfiguration = {
  readonly authentication?: ACPAuthentication;
  readonly providerAuthentication?: ACPResolvedProviderAuthentication;
  readonly providerEnvironment?: Readonly<Record<string, string>>;
  readonly sessionMeta?: Readonly<Record<string, ACPSerializableValue>>;
  readonly clientCapabilities?: Readonly<Record<string, ACPSerializableValue>>;
  readonly askUserQuestionsRequestMethod?: string;
};

const bridgeConfigurationSchema: z.ZodType<ACPBridgeConfiguration> = z.object({
  authentication: authenticationSchema.optional(),
  providerAuthentication: providerAuthenticationSchema.optional(),
  providerEnvironment: z.record(z.string(), z.string()).optional(),
  sessionMeta: serializableRecordSchema.optional(),
  clientCapabilities: serializableRecordSchema.optional(),
  askUserQuestionsRequestMethod: z.string().optional(),
});

export function createACPBridgeEnvironment({
  authentication,
  providerAuthentication,
  providerEnvironment,
  sessionMeta,
  clientCapabilities,
  askUserQuestionsRequestMethod,
}: ACPBridgeConfiguration): Record<string, string> {
  return {
    [ACP_BRIDGE_CONFIGURATION_ENV]: JSON.stringify({
      ...(authentication == null ? {} : { authentication }),
      ...(providerAuthentication == null ? {} : { providerAuthentication }),
      ...(providerEnvironment == null ? {} : { providerEnvironment }),
      ...(sessionMeta == null ? {} : { sessionMeta }),
      ...(clientCapabilities == null ? {} : { clientCapabilities }),
      ...(askUserQuestionsRequestMethod == null
        ? {}
        : { askUserQuestionsRequestMethod }),
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
  try {
    const result = bridgeConfigurationSchema.safeParse(JSON.parse(serialized));
    if (result.success) return result.data;
  } catch {}
  throw new Error('ACP bridge configuration environment is invalid.');
}
