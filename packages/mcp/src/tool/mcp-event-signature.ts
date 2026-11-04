import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';
import { MCPClientError } from '../error/mcp-client-error';

export function createMCPEventSecret(): string {
  return `whsec_${convertUint8ArrayToBase64(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export function decodeMCPEventSecret(secret: string): Uint8Array {
  const encoded = secret.slice(6);
  if (!secret.startsWith('whsec_') || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new MCPClientError({ message: 'Invalid MCP event signing secret' });
  }
  const bytes = convertBase64ToUint8Array(encoded);
  if (bytes.length < 24 || bytes.length > 64) {
    throw new MCPClientError({
      message: 'MCP event signing secrets must contain 24–64 random bytes',
    });
  }
  return bytes;
}

/** Standard Webhooks v1: authenticate the exact body bytes using Web Crypto. */
export async function verifyMCPEventSignature({
  headers,
  body,
  secret,
}: {
  headers: Headers;
  body: Uint8Array;
  secret: string;
}): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (
    !id ||
    !timestamp ||
    !signatures ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  ) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(decodeMCPEventSecret(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix);
  message.set(body, prefix.length);

  for (const signature of signatures.split(' ')) {
    const [version, value] = signature.split(',');
    if (version !== 'v1' || !value) continue;
    try {
      if (
        await crypto.subtle.verify(
          'HMAC',
          key,
          new Uint8Array(convertBase64ToUint8Array(value)),
          message,
        )
      ) {
        return true;
      }
    } catch {
      // A malformed signature must not hide another valid rotation signature.
    }
  }
  return false;
}
