import ms from 'ms';
import { GatewayAuthenticationError } from '../errors';

export interface TokenPayload {
  sub: string;
  name: string;
  exp: number;
}

export interface VercelTokenResponse {
  token: string;
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
  const timeout = ms('15m');
  return token.exp * 1000 < Date.now() + timeout;
}

export async function getUserDataDir(): Promise<string | null> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }

  try {
    const os = await import('os');
    const path = await import('path');

    if (process.env.XDG_DATA_HOME) {
      return process.env.XDG_DATA_HOME;
    }

    switch (os.platform()) {
      case 'darwin':
        return path.join(os.homedir(), 'Library/Application Support');
      case 'linux':
        return path.join(os.homedir(), '.local/share');
      case 'win32':
        if (process.env.LOCALAPPDATA) {
          return process.env.LOCALAPPDATA;
        }
        return null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function findRootDir(): Promise<string | null> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }

  try {
    const path = await import('path');
    const fs = await import('fs');

    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      const vercelPath = path.join(dir, '.vercel');
      if (fs.existsSync(vercelPath)) {
        return dir;
      }
      dir = path.dirname(dir);
    }
  } catch {
    return null;
  }
  return null;
}

export async function findProjectInfo(): Promise<{
  projectId: string;
  teamId?: string;
} | null> {
  const dir = await findRootDir();
  if (!dir) {
    return null;
  }

  try {
    const path = await import('path');
    const fs = await import('fs');

    const prjPath = path.join(dir, '.vercel', 'project.json');
    if (!fs.existsSync(prjPath)) {
      return null;
    }

    const prj = JSON.parse(fs.readFileSync(prjPath, 'utf8'));
    if (typeof prj.projectId !== 'string') {
      return null;
    }

    return {
      projectId: prj.projectId,
      teamId: typeof prj.orgId === 'string' ? prj.orgId : undefined,
    };
  } catch {
    return null;
  }
}

export async function getVercelCliToken(): Promise<string | null> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }

  try {
    const path = await import('path');
    const fs = await import('fs');

    const dataDir = await getUserDataDir();
    if (!dataDir) {
      return null;
    }

    const tokenPath = path.join(dataDir, 'com.vercel.cli', 'auth.json');
    if (!fs.existsSync(tokenPath)) {
      return null;
    }

    const token = fs.readFileSync(tokenPath, 'utf8');
    const parsed = JSON.parse(token);
    return typeof parsed.token === 'string' ? parsed.token : null;
  } catch {
    return null;
  }
}

export async function saveToken(
  token: VercelTokenResponse,
  projectId: string,
): Promise<void> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return;
  }

  try {
    const path = await import('path');
    const fs = await import('fs');

    const dir = await getUserDataDir();
    if (!dir) {
      throw new GatewayAuthenticationError({
        message: 'unable to find user data directory',
        statusCode: 500,
      });
    }

    const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
    const tokenJson = JSON.stringify(token);

    fs.mkdirSync(path.dirname(tokenPath), { mode: 0o700, recursive: true });
    fs.writeFileSync(tokenPath, tokenJson);
    fs.chmodSync(tokenPath, 0o600);
  } catch (e) {
    throw new GatewayAuthenticationError({
      message: 'failed to save token',
      statusCode: 500,
    });
  }
}

export async function loadToken(
  projectId: string,
): Promise<VercelTokenResponse | null> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }

  try {
    const path = await import('path');
    const fs = await import('fs');

    const dir = await getUserDataDir();
    if (!dir) {
      return null;
    }

    const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
    if (!fs.existsSync(tokenPath)) {
      return null;
    }

    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    if (typeof token.token === 'string') {
      return token;
    }
  } catch {
    // ignore errors, return null
  }

  return null;
}

export async function refreshOidcToken(
  authToken: string,
  projectId: string,
  teamId?: string,
): Promise<VercelTokenResponse> {
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
  }
}
