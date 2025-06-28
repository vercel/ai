import { z } from 'zod';

export const GATEWAY_AUTH_METHOD_HEADER = 'x-ai-gateway-auth-method' as const;

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
