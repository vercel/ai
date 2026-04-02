/**
 * Stateless HMAC-signed tokens for authorizing realtime tool execution.
 *
 * The setup endpoint creates a token that encodes which tools are allowed
 * and when the token expires. The execute-tools endpoint verifies the token
 * using the same secret — no server-side state required.
 *
 * Uses the Web Crypto API (`crypto.subtle`) so it works in Node.js,
 * edge runtimes, and Vercel Functions.
 */

const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const;
const TOKEN_SEPARATOR = '.';

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    ALGORITHM,
    false,
    ['sign', 'verify'],
  );
}

function encodeBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

type TokenPayload = {
  /** Sorted list of allowed tool names */
  tools: string[];
  /** Expiry timestamp (seconds since epoch) */
  exp: number;
  /** Issued-at timestamp (seconds since epoch) */
  iat: number;
};

/**
 * Creates an HMAC-signed token that authorizes execution of the specified tools.
 *
 * Call this in your setup/token endpoint and return the token to the client.
 * The client will send it back with each tool execution request.
 *
 * @param options.tools - Array of tool names the session is allowed to execute
 * @param options.secret - Server-side secret for signing (e.g., from an env var)
 * @param options.maxAgeSeconds - Token lifetime in seconds (default: 600 = 10 minutes)
 * @returns The signed token string
 */
export async function createRealtimeToolToken({
  tools,
  secret,
  maxAgeSeconds = 600,
}: {
  tools: string[];
  secret: string;
  maxAgeSeconds?: number;
}): Promise<string> {
  if (!secret || secret.length < 16) {
    throw new Error(
      'Secret must be at least 16 characters. ' +
        'Set AI_REALTIME_SECRET or pass a strong secret.',
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    tools: [...tools].sort(),
    exp: now + maxAgeSeconds,
    iat: now,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadEncoded = encodeBase64Url(payloadBytes.buffer as ArrayBuffer);

  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(ALGORITHM.name, key, payloadBytes);
  const signatureEncoded = encodeBase64Url(signature);

  return `${payloadEncoded}${TOKEN_SEPARATOR}${signatureEncoded}`;
}

/**
 * Verifies an HMAC-signed realtime tool token and checks that the
 * requested tool names are authorized.
 *
 * Call this in your execute-tools endpoint before running any tool.
 *
 * @param options.token - The token string from the client request
 * @param options.secret - The same secret used to create the token
 * @param options.toolNames - Tool names the client is requesting to execute
 * @returns Validation result with `valid: true` or `valid: false` and an error message
 */
export async function verifyRealtimeToolToken({
  token,
  secret,
  toolNames,
}: {
  token: string;
  secret: string;
  toolNames: string[];
}): Promise<{ valid: true } | { valid: false; error: string }> {
  if (!token) {
    return { valid: false, error: 'Missing tool authorization token' };
  }

  const separatorIndex = token.lastIndexOf(TOKEN_SEPARATOR);
  if (separatorIndex === -1) {
    return { valid: false, error: 'Malformed token' };
  }

  const payloadEncoded = token.slice(0, separatorIndex);
  const signatureEncoded = token.slice(separatorIndex + 1);

  // Verify HMAC signature
  let payloadBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    payloadBytes = decodeBase64Url(payloadEncoded);
    signatureBytes = decodeBase64Url(signatureEncoded);
  } catch {
    return { valid: false, error: 'Malformed token encoding' };
  }

  const key = await importKey(secret);
  const isValid = await crypto.subtle.verify(
    ALGORITHM.name,
    key,
    signatureBytes,
    payloadBytes,
  );

  if (!isValid) {
    return { valid: false, error: 'Invalid token signature' };
  }

  // Parse and validate payload
  let payload: TokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { valid: false, error: 'Invalid token payload' };
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return { valid: false, error: 'Token expired' };
  }

  // Check that all requested tools are authorized
  const allowedTools = new Set(payload.tools);
  const unauthorized = toolNames.filter(name => !allowedTools.has(name));
  if (unauthorized.length > 0) {
    return {
      valid: false,
      error: `Unauthorized tool(s): ${unauthorized.join(', ')}`,
    };
  }

  return { valid: true };
}
