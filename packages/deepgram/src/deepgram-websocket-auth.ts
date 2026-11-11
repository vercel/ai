import { InvalidArgumentError } from '@ai-sdk/provider';
import { removeUndefinedEntries, resolve } from '@ai-sdk/provider-utils';
import type { DeepgramConfig } from './deepgram-config';

/**
 * Resolves the handshake headers and authentication subprotocols for a
 * Deepgram WebSocket from the provider and per-call headers.
 */
export async function resolveDeepgramWebSocketAuth({
  config,
  headers: callHeaders,
}: {
  config: DeepgramConfig;
  headers: Record<string, string | undefined> | undefined;
}): Promise<{
  headers: Record<string, string | undefined>;
  protocols: string[] | undefined;
}> {
  const headers: Record<string, string | undefined> = {};
  for (const source of [await resolve(config.headers), callHeaders]) {
    for (const [name, value] of Object.entries(source ?? {})) {
      headers[name.toLowerCase()] = value;
    }
  }
  const authorization = new Headers(removeUndefinedEntries(headers)).get(
    'authorization',
  );
  // The subprotocol authentication channel also works with native WebSockets,
  // which cannot send custom HTTP headers. Never put credentials in the URL.
  const credentials = authorization?.match(/^(Token|Bearer) (\S+)$/i);
  if (authorization != null && credentials == null) {
    throw new InvalidArgumentError({
      argument: 'headers',
      message:
        'Deepgram streaming authorization must use the Token or Bearer scheme.',
    });
  }

  return {
    headers,
    protocols:
      credentials != null
        ? [credentials[1].toLowerCase(), credentials[2]]
        : undefined,
  };
}
