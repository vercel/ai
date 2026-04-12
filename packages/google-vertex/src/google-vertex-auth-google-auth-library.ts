import { GoogleAuth, GoogleAuthOptions } from 'google-auth-library';

/**
 * Creates a auth token generator function for the given options.
 * This avoids reference-equality cache invalidation issues.
 */
export function createAuthTokenGenerator(options?: GoogleAuthOptions) {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    ...options,
  });

  return async function generateAuthToken() {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token?.token ?? null;
  };
}

/**
 * @deprecated Use createAuthTokenGenerator instead.
 * This function is kept for backward compatibility.
 */
export async function generateAuthToken(options?: GoogleAuthOptions) {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    ...options,
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token?.token || null;
}