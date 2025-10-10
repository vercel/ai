import {
  lazyValidator,
  safeValidateTypes,
  zodSchema,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

export const GATEWAY_AUTH_METHOD_HEADER = 'ai-gateway-auth-method' as const;

export async function parseAuthMethod(
  headers: Record<string, string | undefined>,
) {
  const result = await safeValidateTypes({
    value: headers[GATEWAY_AUTH_METHOD_HEADER],
    schema: gatewayAuthMethodSchema,
  });

  return result.success ? result.value : undefined;
}

const gatewayAuthMethodSchema = lazyValidator(() =>
  zodSchema(z.union([z.literal('api-key'), z.literal('oidc')])),
);
