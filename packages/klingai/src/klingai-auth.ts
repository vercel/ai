import { LoadAPIKeyError } from '@ai-sdk/provider';
import { loadOptionalSetting, loadSetting } from '@ai-sdk/provider-utils';

/**
 * Encode a string to base64url format (URL-safe base64 without padding).
 */
const base64url = (str: string) =>
  btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

/**
 * Read a setting and normalize blank values to `undefined`.
 */
function loadTrimmedSetting({
  settingValue,
  environmentVariableName,
}: {
  settingValue: string | undefined;
  environmentVariableName: string;
}): string | undefined {
  const value = loadOptionalSetting({
    settingValue,
    environmentVariableName,
  })?.trim();

  return value === '' ? undefined : value;
}

/**
 * Resolve the bearer token for KlingAI API requests.
 *
 * KlingAI supports two authentication schemes:
 * - A single API key that is sent directly as a bearer token (recommended).
 * - A legacy access key / secret key pair that is used to sign a short-lived
 *   JWT.
 *
 * Explicit options take precedence over environment variables, and the API key
 * takes precedence over the access key / secret key pair:
 *
 * 1. `apiKey` option
 * 2. `accessKey` + `secretKey` options
 * 3. `KLINGAI_API_KEY` environment variable
 * 4. `KLINGAI_ACCESS_KEY` + `KLINGAI_SECRET_KEY` environment variables
 *
 * @see https://kling.ai/document-api/guides/get-started/quick-start
 */
export async function resolveKlingAIAuthToken({
  apiKey,
  accessKey,
  secretKey,
}: {
  apiKey?: string;
  accessKey?: string;
  secretKey?: string;
}): Promise<string> {
  const explicitApiKey = apiKey?.trim();
  if (explicitApiKey) {
    return explicitApiKey;
  }

  if (accessKey != null && secretKey != null) {
    return generateKlingAIAuthToken({ accessKey, secretKey });
  }

  const environmentApiKey = loadTrimmedSetting({
    settingValue: undefined,
    environmentVariableName: 'KLINGAI_API_KEY',
  });
  if (environmentApiKey) {
    return environmentApiKey;
  }

  const hasLegacyCredentials =
    loadTrimmedSetting({
      settingValue: accessKey,
      environmentVariableName: 'KLINGAI_ACCESS_KEY',
    }) != null ||
    loadTrimmedSetting({
      settingValue: secretKey,
      environmentVariableName: 'KLINGAI_SECRET_KEY',
    }) != null;

  if (!hasLegacyCredentials) {
    throw new LoadAPIKeyError({
      message:
        "KlingAI API key is missing. Pass it using the 'apiKey' parameter " +
        'or the KLINGAI_API_KEY environment variable. Alternatively, pass the ' +
        "legacy 'accessKey' and 'secretKey' parameters or the " +
        'KLINGAI_ACCESS_KEY and KLINGAI_SECRET_KEY environment variables.',
    });
  }

  return generateKlingAIAuthToken({ accessKey, secretKey });
}

/**
 * Generate a JWT authentication token for KlingAI API access from a legacy
 * access key / secret key pair.
 *
 * Uses HS256 (HMAC-SHA256) signing via the Web Crypto API — no external
 * dependencies required. Compatible with Node.js, Edge, and browser runtimes.
 *
 * @see https://app.klingai.com/global/dev/document-api/quickStart/userManual
 * @see https://app.klingai.com/global/dev/document-api/apiReference/commonInfo
 */
export async function generateKlingAIAuthToken({
  accessKey,
  secretKey,
}: {
  accessKey?: string;
  secretKey?: string;
}): Promise<string> {
  const ak = loadSetting({
    settingValue: accessKey,
    settingName: 'accessKey',
    environmentVariableName: 'KLINGAI_ACCESS_KEY',
    description: 'KlingAI access key',
  });

  const sk = loadSetting({
    settingValue: secretKey,
    settingName: 'secretKey',
    environmentVariableName: 'KLINGAI_SECRET_KEY',
    description: 'KlingAI secret key',
  });

  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: ak,
    exp: now + 1800, // Valid for 30 minutes
    nbf: now - 5, // Valid 5 seconds before current time
  };

  const encoder = new TextEncoder();

  // Import the secret key for HMAC-SHA256 signing
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(sk),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signingInput),
  );

  const signatureBytes = new Uint8Array(signature);
  const signatureBase64 = base64url(
    String.fromCharCode.apply(null, Array.from(signatureBytes)),
  );

  return `${signingInput}.${signatureBase64}`;
}
