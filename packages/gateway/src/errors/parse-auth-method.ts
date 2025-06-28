import { z } from 'zod';

export const GATEWAY_AUTH_METHOD_HEADER = 'x-ai-gateway-auth-method' as const;

export function parseAuthMethod(headers: Record<string, string | undefined>) {
  return gatewayAuthMethodSchema.parse(headers[GATEWAY_AUTH_METHOD_HEADER]);
}

const gatewayAuthMethodSchema = z.union([
  z.literal('api-key'),
  z.literal('oidc'),
]);
