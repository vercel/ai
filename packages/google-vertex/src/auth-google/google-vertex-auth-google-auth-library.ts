import type { GoogleAuth, GoogleAuthOptions } from 'google-auth-library';
import { loadModuleDynamically } from '../load-module-dynamically';

async function getAuth(options: GoogleAuthOptions = {}): Promise<GoogleAuth> {
  const GoogleAuthClass = await loadModuleDynamically<typeof GoogleAuth>({
    libraryName: 'google-auth-library',
    exportName: 'GoogleAuth',
  });

  return new GoogleAuthClass({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    ...options,
  });
}

export async function generateAuthToken(options?: GoogleAuthOptions) {
  const auth = await getAuth(options);
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token?.token ?? '';
}
