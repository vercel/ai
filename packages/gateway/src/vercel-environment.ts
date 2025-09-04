import { GatewayAuthenticationError } from './errors';
import {
  getTokenPayload,
  isExpired,
  tryRefreshOidcToken,
} from './auth/oidc-token-utils';

export async function getVercelOidcToken(): Promise<string> {
  let token =
    getContext().headers?.['x-vercel-oidc-token'] ??
    process.env.VERCEL_OIDC_TOKEN;

  if (!token) {
    throw new GatewayAuthenticationError({
      message: 'OIDC token not available',
      statusCode: 401,
    });
  }

  // check if token is expired and try to refresh
  try {
    const payload = getTokenPayload(token);
    if (isExpired(payload)) {
      const refreshedToken = await tryRefreshOidcToken();
      if (refreshedToken) {
        process.env.VERCEL_OIDC_TOKEN = refreshedToken;
        return refreshedToken;
      }
    }
  } catch {
    // if token parsing fails, try to refresh anyway
    const refreshedToken = await tryRefreshOidcToken();
    if (refreshedToken) {
      process.env.VERCEL_OIDC_TOKEN = refreshedToken;
      return refreshedToken;
    }
  }

  return token;
}

export async function getVercelRequestId(): Promise<string | undefined> {
  return getContext().headers?.['x-vercel-id'];
}

type Context = {
  headers?: Record<string, string>;
};

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

function getContext(): Context {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}
