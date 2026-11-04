import { GoogleAuth, type GoogleAuthOptions } from 'google-auth-library';

function createGoogleAuth(options?: GoogleAuthOptions) {
  return new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    ...options,
  });
}

export function createAuthTokenGenerator(options?: GoogleAuthOptions) {
  const auth = createGoogleAuth(options);

  return async function generateAuthToken() {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token?.token ?? null;
  };
}

export function createAuthHeadersGenerator(options?: GoogleAuthOptions) {
  const auth = createGoogleAuth(options);

  return async function generateAuthHeaders() {
    const client = await auth.getClient();
    return Object.fromEntries((await client.getRequestHeaders()).entries());
  };
}
