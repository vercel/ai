import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

export async function generateAuthToken() {
  console.log('Generating auth token');
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  console.log('Auth token generated', token);
  return token?.token || null;
}
