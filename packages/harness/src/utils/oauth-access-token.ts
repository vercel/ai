import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';

const DEFAULT_REFRESH_WINDOW_MS = 300_000;

export type OAuthCredential = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
};

export type RefreshOAuthAccessTokenResult = {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly refreshToken?: string;
};

export function isAccessTokenExpiringSoon({
  expiresAt,
  now = Date.now(),
  refreshWindowMs = DEFAULT_REFRESH_WINDOW_MS,
}: {
  readonly expiresAt: number;
  readonly now?: number;
  readonly refreshWindowMs?: number;
}): boolean {
  return expiresAt <= now + refreshWindowMs;
}

export async function refreshOAuthAccessToken({
  tokenUrl,
  clientId,
  refreshToken,
  requestFormat = 'form',
  headers,
  fetch: fetchImplementation = globalThis.fetch,
}: {
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly refreshToken: string;
  readonly requestFormat?: 'json' | 'form';
  readonly headers?: Record<string, string>;
  readonly fetch?: typeof globalThis.fetch;
}): Promise<RefreshOAuthAccessTokenResult> {
  const values = {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  };
  const response = await fetchImplementation(tokenUrl, {
    method: 'POST',
    headers: {
      'content-type':
        requestFormat === 'json'
          ? 'application/json'
          : 'application/x-www-form-urlencoded',
      ...headers,
    },
    body:
      requestFormat === 'json'
        ? JSON.stringify(values)
        : new URLSearchParams(values).toString(),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `OAuth access token refresh failed with status ${response.status}.`,
    );
  }

  const parsed = await safeParseJSON({ text: responseText });
  if (!parsed.success || !isRecord(parsed.value)) {
    throw new Error('OAuth access token refresh returned invalid JSON.');
  }

  const accessToken = parsed.value.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error(
      'OAuth access token refresh response is missing access_token.',
    );
  }

  const expiresAt = await resolveExpiresAt({
    accessToken,
    expiresIn: parsed.value.expires_in,
  });
  const rotatedRefreshToken = parsed.value.refresh_token;
  if (
    rotatedRefreshToken != null &&
    (typeof rotatedRefreshToken !== 'string' ||
      rotatedRefreshToken.length === 0)
  ) {
    throw new Error(
      'OAuth access token refresh response contains an invalid refresh_token.',
    );
  }

  return {
    accessToken,
    expiresAt,
    ...(typeof rotatedRefreshToken === 'string'
      ? { refreshToken: rotatedRefreshToken }
      : {}),
  };
}

async function resolveExpiresAt({
  accessToken,
  expiresIn,
}: {
  accessToken: string;
  expiresIn: unknown;
}): Promise<number> {
  if (
    typeof expiresIn === 'number' &&
    Number.isFinite(expiresIn) &&
    expiresIn >= 0
  ) {
    return Date.now() + expiresIn * 1000;
  }

  const segments = accessToken.split('.');
  if (segments.length === 3) {
    try {
      const payloadText = Buffer.from(segments[1], 'base64url').toString(
        'utf8',
      );
      const parsed = await safeParseJSON({ text: payloadText });
      if (
        parsed.success &&
        isRecord(parsed.value) &&
        typeof parsed.value.exp === 'number' &&
        Number.isFinite(parsed.value.exp)
      ) {
        return parsed.value.exp * 1000;
      }
    } catch {}
  }

  throw new Error(
    'OAuth access token refresh response does not include a usable expiry.',
  );
}
