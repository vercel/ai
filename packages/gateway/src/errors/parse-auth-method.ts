import { z } from 'zod/v4';

export const GATEWAY_AUTH_METHOD_HEADER = 'ai-gateway-auth-method' as const;

export function parseAuthMethod(headers: Record<string, string | undefined>) {
  const result = gatewayAuthMethodSchema.safeParse(
    headers[GATEWAY_AUTH_METHOD_HEADER],
  );
  return result.success ? result.data : undefined;
}

const gatewayAuthMethodSchema = z.union([
  z.literal('api-key'),
  z.literal('oidc'),
]);
