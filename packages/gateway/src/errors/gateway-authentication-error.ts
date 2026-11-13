import { GatewayError } from './gateway-error';

const name = 'GatewayAuthenticationError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

const createApiKeyUrl =
  'https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys%3FshowCreateKeyModal%3Dtrue&title=Create+an+AI+Gateway+API+key';

/**
 * Why authentication failed, when it is known:
 * - `missing_credentials`: no API key or OIDC token was available.
 * - `invalid_api_key`: an API key was sent and rejected.
 * - `invalid_oidc_token`: an OIDC token was sent and rejected.
 */
export type GatewayCredentialStatus =
  | 'missing_credentials'
  | 'invalid_api_key'
  | 'invalid_oidc_token';

/**
 * Authentication failed - invalid API key or OIDC token
 */
export class GatewayAuthenticationError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'authentication_error';
  readonly credentialStatus?: GatewayCredentialStatus;

  constructor({
    message = 'Authentication failed',
    statusCode = 401,
    cause,
    generationId,
    credentialStatus,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
    generationId?: string;
    credentialStatus?: GatewayCredentialStatus;
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this.credentialStatus = credentialStatus;
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
    statusCode = 401,
    cause,
    generationId,
  }: {
    apiKeyProvided: boolean;
    oidcTokenProvided: boolean;
    message?: string;
    statusCode?: number;
    cause?: unknown;
    generationId?: string;
  }): GatewayAuthenticationError {
    let contextualMessage: string;
    let credentialStatus: GatewayCredentialStatus;

    if (apiKeyProvided) {
      credentialStatus = 'invalid_api_key';
      contextualMessage = `AI Gateway authentication failed: Invalid API key or token.

Create a new API key: ${createApiKeyUrl}

Provide an API key or Vercel access token via 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable.`;
    } else if (oidcTokenProvided) {
      credentialStatus = 'invalid_oidc_token';
      contextualMessage = `AI Gateway authentication failed: Invalid OIDC token.

Run 'npx vercel link' to link your project, then 'vc env pull' to fetch the token.

Alternatively, use an API key: ${createApiKeyUrl}
or pass a Vercel access token via the 'apiKey' option.`;
    } else {
      credentialStatus = 'missing_credentials';
      contextualMessage = `AI Gateway authentication failed: No authentication provided.

Option 1 - API key:
Create an API key: ${createApiKeyUrl}
Provide via 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable.

Option 2 - Vercel access token:
Pass a Vercel personal access token or Vercel app access token via the 'apiKey' option.

Option 3 - OIDC token:
Run 'npx vercel link' to link your project, then 'vc env pull' to fetch the token.`;
    }

    return new GatewayAuthenticationError({
      message: contextualMessage,
      statusCode,
      cause,
      generationId,
      credentialStatus,
    });
  }
}
