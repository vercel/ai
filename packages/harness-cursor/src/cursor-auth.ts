import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';

export type CursorAuthOptions = {
  /** Explicit Cursor API key override. */
  readonly apiKey?: string;
};

export { getAiGatewayAuthFromEnv };

/**
 * Resolve the environment-variable blob the cursor bridge needs.
 * Precedence: explicit `auth.apiKey` → `processEnv.CURSOR_API_KEY`.
 */
export function resolveCursorEnv(
  auth: CursorAuthOptions | undefined,
  processEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const apiKey = auth?.apiKey ?? processEnv.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Cursor harness requires CURSOR_API_KEY. Set it in the environment or pass createCursor({ auth: { apiKey } }).',
    );
  }
  return { CURSOR_API_KEY: apiKey };
}
