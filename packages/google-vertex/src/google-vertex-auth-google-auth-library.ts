import { GoogleAuth, type GoogleAuthOptions } from 'google-auth-library';
<<<<<<< HEAD

let authInstance: GoogleAuth | null = null;
let authOptions: GoogleAuthOptions | null = null;
=======
>>>>>>> 96d056d69 (fix: reuse google auth per provider instance (#14102))

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
