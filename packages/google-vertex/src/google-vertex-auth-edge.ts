export interface GoogleCredentials {
  /**
   * The client email for the Google Cloud service account.
   */
  clientEmail: string;

  /**
   * The private key for the Google Cloud service account.
   */
  privateKey: string;

  /**
   * The private key ID for the Google Cloud service account.
   */
  privateKeyId: string;
}

// Helper to load credentials from either file or env vars
const loadCredentials = async (): Promise<GoogleCredentials> => {
  try {
    // First try to load from credentials file
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credsPath) {
      const credentials = require(credsPath);
      return {
        clientEmail: credentials.client_email,
        privateKey: credentials.private_key,
        privateKeyId: credentials.private_key_id,
      };
    }

    // Fall back to environment variables
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const privateKeyId = process.env.GOOGLE_PRIVATE_KEY_ID;
    if (!clientEmail || !privateKey || !privateKeyId) {
      throw new Error(
        'Google credentials not found. Please provide either:\n' +
          '1. A credentials file path in GOOGLE_APPLICATION_CREDENTIALS, or\n' +
          '2. GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_PRIVATE_KEY_ID environment variables',
      );
    }

    return {
      clientEmail,
      privateKey,
      privateKeyId,
    };
  } catch (error: any) {
    throw new Error(`Failed to load Google credentials: ${error.message}`);
  }
};

// Convert a string to base64url
const base64url = (str: string) => {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

// Import a private key from a string
const importPrivateKey = async (pemKey: string) => {
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = pemKey.substring(
    pemHeader.length,
    pemKey.length - pemFooter.length,
  );
  const binaryDerString = Buffer.from(pemContents, 'base64').toString('binary');
  const binaryDer = new Uint8Array(binaryDerString.length);

  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['sign'],
  );
};

const buildJwt = async (credentials: GoogleCredentials) => {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: credentials.privateKeyId,
  };

  const payload = {
    iss: credentials.clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const privateKey = await importPrivateKey(credentials.privateKey);

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(signingInput);

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    data,
  );

  const signatureBase64 = base64url(
    String.fromCharCode(...new Uint8Array(signature)),
  );

  return `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}.${signatureBase64}`;
};

/**
 * Generate an authentication token for Google Vertex AI in a manner compatible
 * with the Edge runtime.
 */
export async function generateAuthToken(credentials?: GoogleCredentials) {
  try {
    const creds = credentials || (await loadCredentials());
    const jwt = await buildJwt(creds);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    throw error;
  }
}
