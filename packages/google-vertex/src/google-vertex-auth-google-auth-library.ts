import { GoogleAuth } from 'google-auth-library';

let authInstance: GoogleAuth | null = null;

function getAuth() {
  if (!authInstance) {
    authInstance = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  return authInstance;
}

export async function generateAuthToken() {
  const auth = getAuth();
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token?.token || null;
}

// For testing purposes only
export function _resetAuthInstance() {
  authInstance = null;
}
