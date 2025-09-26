import { loadOptionalSetting } from '@ai-sdk/provider-utils';
import { GatewayAuthenticationError } from '../errors';

export interface VercelTokenResponse {
  token: string;
}

export async function getUserDataDir(): Promise<string | null> {
  const xdgDataHome = loadOptionalSetting({
    settingValue: undefined,
    environmentVariableName: 'XDG_DATA_HOME',
  });

  if (xdgDataHome) {
    return xdgDataHome;
  }

  try {
    const os = await import('os');
    const path = await import('path');

    switch (os.platform()) {
      case 'darwin':
        return path.join(os.homedir(), 'Library/Application Support');
      case 'linux':
        return path.join(os.homedir(), '.local/share');
      case 'win32': {
        const localAppData = loadOptionalSetting({
          settingValue: undefined,
          environmentVariableName: 'LOCALAPPDATA',
        });
        return localAppData ?? null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function findRootDir(): Promise<string | null> {
  try {
    const path = await import('path');
    const { promises: fs } = await import('fs');

    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      const vercelPath = path.join(dir, '.vercel');
      try {
        await fs.access(vercelPath);
        return dir;
      } catch {
        // directory doesn't exist, continue searching
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
    const { promises: fs } = await import('fs');

    const prjPath = path.join(dir, '.vercel', 'project.json');
    const prj = JSON.parse(await fs.readFile(prjPath, 'utf8'));
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
  try {
    const path = await import('path');
    const { promises: fs } = await import('fs');

    const dataDir = await getUserDataDir();
    if (!dataDir) {
      return null;
    }

    const tokenPath = path.join(dataDir, 'com.vercel.cli', 'auth.json');
    const token = await fs.readFile(tokenPath, 'utf8');
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
  try {
    const path = await import('path');
    const { promises: fs } = await import('fs');

    const dir = await getUserDataDir();
    if (!dir) {
      throw new GatewayAuthenticationError({
        message: 'unable to find user data directory',
        statusCode: 500,
      });
    }

    const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
    const tokenJson = JSON.stringify(token);

    // create directory with restricted permissions (owner only)
    await fs.mkdir(path.dirname(tokenPath), { mode: 0o700, recursive: true });
    // write token file with restricted permissions (owner read/write only)
    await fs.writeFile(tokenPath, tokenJson, { mode: 0o600 });
  } catch (e) {
    // preserve the original error if it's already a GatewayAuthenticationError
    if (e instanceof GatewayAuthenticationError) {
      throw e;
    }
    // only wrap non-GatewayAuthenticationError exceptions
    throw new GatewayAuthenticationError({
      message: 'failed to save token',
      statusCode: 500,
    });
  }
}

export async function loadToken(
  projectId: string,
): Promise<VercelTokenResponse | null> {
  try {
    const path = await import('path');
    const { promises: fs } = await import('fs');

    const dir = await getUserDataDir();
    if (!dir) {
      return null;
    }

    const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
    const token = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
    if (typeof token.token === 'string') {
      return token;
    }
  } catch {
    // ignore errors, return null
  }

  return null;
}
