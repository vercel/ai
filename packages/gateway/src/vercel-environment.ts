import { GatewayAuthenticationError } from './errors';
import {
  getTokenPayload,
  isExpired,
  tryRefreshOidcToken,
} from './auth/oidc-token-utils';

let refreshPromise: Promise<string | null> | null = null;

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
      if (refreshPromise) {
        const refreshedToken = await refreshPromise;
        if (refreshedToken) {
          return refreshedToken;
        }
      } else {
        refreshPromise = tryRefreshOidcToken();
        try {
          const refreshedToken = await refreshPromise;
          if (refreshedToken) {
            process.env.VERCEL_OIDC_TOKEN = refreshedToken;
            return refreshedToken;
          }
        } finally {
          refreshPromise = null;
        }
      }
      // token is expired and refresh failed - throw error with context
      throw new GatewayAuthenticationError({
        message:
          'OIDC token is expired and automatic refresh failed. Please regenerate your deployment or check your Vercel CLI authentication.',
        statusCode: 401,
      });
    }
  } catch (e) {
    // if it's already a GatewayAuthenticationError from the expired check, re-throw
    if (e instanceof GatewayAuthenticationError) {
      throw e;
    }
    // if we can't parse the token, try to refresh
    if (refreshPromise) {
      const refreshedToken = await refreshPromise;
      if (refreshedToken) {
        return refreshedToken;
      }
    } else {
      refreshPromise = tryRefreshOidcToken();
      try {
        const refreshedToken = await refreshPromise;
        if (refreshedToken) {
          process.env.VERCEL_OIDC_TOKEN = refreshedToken;
          return refreshedToken;
        }
      } finally {
        refreshPromise = null;
      }
    }
    // token is malformed and refresh failed - throw error with context
    throw new GatewayAuthenticationError({
      message:
        'OIDC token is malformed and automatic refresh failed. Please regenerate your deployment or check your Vercel CLI authentication.',
      statusCode: 401,
    });
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
