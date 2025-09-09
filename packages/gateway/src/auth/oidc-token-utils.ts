import { GatewayAuthenticationError } from '../errors';

export interface TokenPayload {
  sub: string;
  name: string;
  exp: number;
}


export function getTokenPayload(token: string): TokenPayload {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new GatewayAuthenticationError({
      message: 'invalid token format',
      statusCode: 401,
    });
  }

  const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '=',
  );

  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    throw new GatewayAuthenticationError({
      message: 'invalid token payload',
      statusCode: 401,
    });
  }
}

export function isExpired(token: TokenPayload): boolean {
  const timeout = 15 * 60 * 1000;
  return token.exp * 1000 < Date.now() + timeout;
}

export interface VercelTokenResponse {
  token: string;
}

// lazy-load filesystem operations to avoid bundling them in browser builds
let fsOps: {
  findProjectInfo: () => Promise<{ projectId: string; teamId?: string } | null>;
  getVercelCliToken: () => Promise<string | null>;
  loadToken: (projectId: string) => Promise<VercelTokenResponse | null>;
  saveToken: (token: VercelTokenResponse, projectId: string) => Promise<void>;
} | null = null;

async function getFsOps() {
  if (fsOps) return fsOps;
  
  // only load filesystem operations in node environments
  if (typeof process === 'undefined' || !process.versions?.node) {
    // return no-op implementations for browser
    fsOps = {
      findProjectInfo: async () => null,
      getVercelCliToken: async () => null,
      loadToken: async () => null,
      saveToken: async () => {},
    };
  } else {
    // dynamically import filesystem operations for node
    const fsModule = await import('./oidc-token-utils-fs');
    fsOps = {
      findProjectInfo: fsModule.findProjectInfo,
      getVercelCliToken: fsModule.getVercelCliToken,
      loadToken: fsModule.loadToken,
      saveToken: fsModule.saveToken,
    };
  }
  
  return fsOps;
}

const refreshCache = new Map<string, Promise<VercelTokenResponse>>();

async function refreshOidcToken(
  authToken: string,
  projectId: string,
  teamId?: string,
): Promise<VercelTokenResponse> {
  const cacheKey = `${authToken}:${projectId}:${teamId ?? ''}`;

  const existingPromise = refreshCache.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const refreshPromise = (async () => {
    const url = `https://api.vercel.com/v1/projects/${projectId}/token?source=vercel-oidc-refresh${teamId ? `&teamId=${teamId}` : ''}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        throw new GatewayAuthenticationError({
          message: `failed to refresh oidc token: ${res.statusText}`,
          statusCode: res.status,
        });
      }

      const tokenRes = await res.json();

      if (
        !tokenRes ||
        typeof tokenRes !== 'object' ||
        typeof tokenRes.token !== 'string'
      ) {
        throw new GatewayAuthenticationError({
          message: 'invalid token response from vercel api',
          statusCode: 502,
        });
      }

      return tokenRes;
    } catch (e) {
      if (e instanceof GatewayAuthenticationError) {
        throw e;
      }
      throw new GatewayAuthenticationError({
        message: 'failed to refresh oidc token',
        statusCode: 500,
      });
    } finally {
      refreshCache.delete(cacheKey);
    }
  })();

  refreshCache.set(cacheKey, refreshPromise);

  return refreshPromise;
}

export async function tryRefreshOidcToken(): Promise<string | null> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }

  try {
    const ops = await getFsOps();
    const projectInfo = await ops.findProjectInfo();
    if (!projectInfo) {
      return null;
    }

    const { projectId, teamId } = projectInfo;
    let maybeToken = await ops.loadToken(projectId);

    let needsRefresh = !maybeToken;

    if (maybeToken) {
      try {
        const payload = getTokenPayload(maybeToken.token);
        needsRefresh = isExpired(payload);
      } catch {
        needsRefresh = true;
      }
    }

    if (needsRefresh) {
      const authToken = await ops.getVercelCliToken();
      if (!authToken) {
        return null;
      }

      maybeToken = await refreshOidcToken(authToken, projectId, teamId);
      await ops.saveToken(maybeToken, projectId);
    }

    return maybeToken?.token ?? null;
  } catch {
    return null;
  }
}
