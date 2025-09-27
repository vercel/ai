import { VercelOidcTokenError } from './token-error';
import {
  findProjectInfo,
  getTokenPayload,
  getVercelCliToken,
  getVercelOidcToken,
  isExpired,
  loadToken,
  saveToken,
} from './token-util';

export async function refreshToken() {
  const { projectId, teamId } = findProjectInfo();
  let maybeToken = loadToken(projectId);

  if (!maybeToken || isExpired(getTokenPayload(maybeToken.token))) {
    const authToken = getVercelCliToken();
    if (!authToken) {
      throw new VercelOidcTokenError(
        'Failed to refresh OIDC token: login to vercel cli',
      );
    }
    if (!projectId) {
      throw new VercelOidcTokenError(
        'Failed to refresh OIDC token: project id not found',
      );
    }
    maybeToken = await getVercelOidcToken(authToken, projectId, teamId);
    if (!maybeToken) {
      throw new VercelOidcTokenError('Failed to refresh OIDC token');
    }
    saveToken(maybeToken, projectId);
  }
  process.env.VERCEL_OIDC_TOKEN = maybeToken.token;
  return;
}
