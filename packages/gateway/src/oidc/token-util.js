import * as path from 'path';
import * as fs from 'fs';
import { VercelOidcTokenError } from './token-error.js';
import { findRootDir, getUserDataDir } from './token-io.js';

export function getVercelDataDir() {
  const vercelFolder = 'com.vercel.cli';
  const dataDir = getUserDataDir();
  if (!dataDir) {
    return null;
  }
  return path.join(dataDir, vercelFolder);
}

export function getVercelCliToken() {
  const dataDir = getVercelDataDir();
  if (!dataDir) {
    return null;
  }
  const tokenPath = path.join(dataDir, 'auth.json');
  if (!fs.existsSync(tokenPath)) {
    return null;
  }
  const token = fs.readFileSync(tokenPath, 'utf8');
  if (!token) {
    return null;
  }
  return JSON.parse(token).token;
}

export async function getVercelOidcToken(authToken, projectId, teamId) {
  try {
    const url = `https://api.vercel.com/v1/projects/${projectId}/token?source=vercel-oidc-refresh${teamId ? `&teamId=${teamId}` : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    if (!res.ok) {
      throw new VercelOidcTokenError(
        `Failed to refresh OIDC token: ${res.statusText}`,
      );
    }
    const tokenRes = await res.json();
    assertVercelOidcTokenResponse(tokenRes);
    return tokenRes;
  } catch (e) {
    throw new VercelOidcTokenError(`Failed to refresh OIDC token`, e);
  }
}

export function assertVercelOidcTokenResponse(res) {
  if (!res || typeof res !== 'object') {
    throw new TypeError('Expected an object');
  }
  if (!('token' in res) || typeof res.token !== 'string') {
    throw new TypeError('Expected a string-valued token property');
  }
}

export function findProjectInfo() {
  const dir = findRootDir();
  if (!dir) {
    throw new VercelOidcTokenError('Unable to find root directory');
  }
  try {
    const prjPath = path.join(dir, '.vercel', 'project.json');
    if (!fs.existsSync(prjPath)) {
      throw new VercelOidcTokenError('project.json not found');
    }
    const prj = JSON.parse(fs.readFileSync(prjPath, 'utf8'));
    if (typeof prj.projectId !== 'string' && typeof prj.orgId !== 'string') {
      throw new TypeError('Expected a string-valued projectId property');
    }
    return { projectId: prj.projectId, teamId: prj.orgId };
  } catch (e) {
    throw new VercelOidcTokenError(`Unable to find project ID`, e);
  }
}

export function saveToken(token, projectId) {
  try {
    const dir = getUserDataDir();
    if (!dir) {
      throw new VercelOidcTokenError('Unable to find user data directory');
    }
    const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
    const tokenJson = JSON.stringify(token);
    fs.mkdirSync(path.dirname(tokenPath), { mode: 0o660, recursive: true }); // read/write perms for owner only
    fs.writeFileSync(tokenPath, tokenJson);
    fs.chmodSync(tokenPath, 0o660); // read/write perms for owner only
    return;
  } catch (e) {
    throw new VercelOidcTokenError(`Failed to save token`, e);
  }
}

export function loadToken(projectId) {
  try {
    const dir = getUserDataDir();
    if (!dir) {
      return null;
    }
    const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
    if (!fs.existsSync(tokenPath)) {
      return null;
    }
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    assertVercelOidcTokenResponse(token);
    return token;
  } catch (e) {
    throw new VercelOidcTokenError(`Failed to load token`, e);
  }
}

export function getTokenPayload(token) {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new VercelOidcTokenError('Invalid token');
  }

  const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '=',
  );
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

const TIME_15_MINUTES_IN_MS = 15 * 60 * 1000;

export function isExpired(token) {
  const timeout = TIME_15_MINUTES_IN_MS;
  return token.exp * 1000 < Date.now() + timeout;
}
