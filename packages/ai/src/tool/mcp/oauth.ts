export type AuthResult = 'AUTHORIZED' | 'UNAUTHORIZED';

export interface OAuthClientProvider {
  /**
   * Returns current access token if present; null otherwise.
   */
  tokens(): Promise<{ access_token: string } | null>;

  /**
   * Performs (or completes) OAuth for the given server.
   * Should persist tokens so subsequent tokens() calls return the new access_token.
   */
  authorize(options: {
    serverUrl: URL;
    resourceMetadataUrl?: URL;
  }): Promise<AuthResult>;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Extracts the OAuth 2.0 Protected Resource Metadata URL from a WWW-Authenticate header (RFC9728).
 * Looks for a resource="..." parameter.
 */
export function extractResourceMetadataUrl(
  response: Response,
): URL | undefined {
  const header =
    response.headers.get('www-authenticate') ??
    response.headers.get('WWW-Authenticate');
  if (!header) return undefined;

  // Example: WWW-Authenticate: Bearer resource="https://mcp.example.com/.well-known/oauth-protected-resource"
  // covers https, http, wss
  const match = header.match(/resource="([^"]+)"/i);
  if (!match) return undefined;

  try {
    return new URL(match[1]);
  } catch {
    return undefined;
  }
}
