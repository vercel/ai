import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';

export async function parseJwtPayload({
  token,
}: {
  token: string;
}): Promise<Readonly<Record<string, unknown>> | undefined> {
  const segments = token.split('.');
  if (segments.length !== 3) return undefined;

  try {
    const parsed = await safeParseJSON({
      text: Buffer.from(segments[1], 'base64url').toString('utf8'),
    });
    return parsed.success && isRecord(parsed.value) ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

export async function getJwtExpiresAt({
  token,
}: {
  token: string;
}): Promise<number | undefined> {
  const payload = await parseJwtPayload({ token });
  const expiresAt = payload?.exp;
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt)
    ? expiresAt * 1000
    : undefined;
}
