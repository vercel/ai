import { GatewayAuthenticationError } from './errors';
import {
  getTokenPayload,
  isExpired,
  findProjectInfo,
  getVercelCliToken,
  loadToken,
  saveToken,
  refreshOidcToken,
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
      const refreshedToken = await tryRefreshToken();
      if (refreshedToken) {
        process.env.VERCEL_OIDC_TOKEN = refreshedToken;
        return refreshedToken;
      }
    }
  } catch {
    // if token parsing fails, try to refresh anyway
    const refreshedToken = await tryRefreshToken();
    if (refreshedToken) {
      process.env.VERCEL_OIDC_TOKEN = refreshedToken;
      return refreshedToken;
    }
  }

  return token;
}

async function tryRefreshToken(): Promise<string | null> {
  try {
    const projectInfo = await findProjectInfo();
    if (!projectInfo) {
      return null;
    }

    const { projectId, teamId } = projectInfo;
    let maybeToken = await loadToken(projectId);

    if (!maybeToken || isExpired(getTokenPayload(maybeToken.token))) {
      const authToken = await getVercelCliToken();
      if (!authToken) {
        return null;
      }

      maybeToken = await refreshOidcToken(authToken, projectId, teamId);
      await saveToken(maybeToken, projectId);
    }

    return maybeToken.token;
  } catch {
    return null;
  }
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
