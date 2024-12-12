import { GoogleAuth, GoogleAuthOptions } from 'google-auth-library';

let authInstance: GoogleAuth | null = null;
let authOptions: GoogleAuthOptions | null = null;

function getAuth(options: GoogleAuthOptions) {
  if (!authInstance || options !== authOptions) {
    authInstance = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      ...options,
    });
    authOptions = options;
  }
  return authInstance;
}

export async function generateAuthToken(options?: GoogleAuthOptions) {
  const auth = getAuth(options || {});
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token?.token || null;
}

// For testing purposes only
export function _resetAuthInstance() {
  authInstance = null;
}
