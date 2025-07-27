import { GatewayError } from './gateway-error';

const name = 'GatewayAuthenticationError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Authentication failed - invalid API key or OIDC token
 */
export class GatewayAuthenticationError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'authentication_error';

  constructor({
    message = 'Authentication failed',
    statusCode = 401,
    cause,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
  } = {}) {
    super({ message, statusCode, cause });
  }

  static isInstance(error: unknown): error is GatewayAuthenticationError {
    return GatewayError.hasMarker(error) && symbol in error;
  }

  /**
   * Creates a contextual error message when authentication fails
   */
  static createContextualError({
    apiKeyProvided,
    oidcTokenProvided,
    message = 'Authentication failed',
    statusCode = 401,
    cause,
  }: {
    apiKeyProvided: boolean;
    oidcTokenProvided: boolean;
    message?: string;
    statusCode?: number;
    cause?: unknown;
  }): GatewayAuthenticationError {
    let contextualMessage: string;

    if (apiKeyProvided) {
      contextualMessage = `AI Gateway authentication failed: Invalid API key provided.

The token is expected to be provided via the 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable.`;
    } else if (oidcTokenProvided) {
      contextualMessage = `AI Gateway authentication failed: Invalid OIDC token provided.

The token is expected to be provided via the 'VERCEL_OIDC_TOKEN' environment variable. It expires every 12 hours.
- make sure your Vercel project settings have OIDC enabled
- if running locally with 'vercel dev', the token is automatically obtained and refreshed
- if running locally with your own dev server, run 'vercel env pull' to fetch the token
- in production/preview, the token is automatically obtained and refreshed

Alternative: Provide an API key via 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable.`;
    } else {
      contextualMessage = `AI Gateway authentication failed: No authentication provided.

Provide either an API key or OIDC token.

API key instructions:

The token is expected to be provided via the 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable.

OIDC token instructions:

The token is expected to be provided via the 'VERCEL_OIDC_TOKEN' environment variable. It expires every 12 hours.
- make sure your Vercel project settings have OIDC enabled
- if running locally with 'vercel dev', the token is automatically obtained and refreshed
- if running locally with your own dev server, run 'vercel env pull' to fetch the token
- in production/preview, the token is automatically obtained and refreshed`;
    }

    return new GatewayAuthenticationError({
      message: contextualMessage,
      statusCode,
      cause,
    });
  }
}
