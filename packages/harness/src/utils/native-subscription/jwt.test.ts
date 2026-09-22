import { describe, expect, it } from 'vitest';
import { getJwtExpiresAt, parseJwtPayload } from './jwt';

function createJwt(payload: unknown): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

describe('parseJwtPayload', () => {
  it('parses an object payload', async () => {
    await expect(
      parseJwtPayload({ token: createJwt({ subject: 'user' }) }),
    ).resolves.toEqual({ subject: 'user' });
  });

  it.each([
    'not-a-jwt',
    'header.payload',
    'header.not-json.signature',
    createJwt('not-an-object'),
  ])('returns undefined for %s', async token => {
    await expect(parseJwtPayload({ token })).resolves.toBeUndefined();
  });
});

describe('getJwtExpiresAt', () => {
  it('converts the exp claim from seconds to milliseconds', async () => {
    await expect(
      getJwtExpiresAt({ token: createJwt({ exp: 1234 }) }),
    ).resolves.toBe(1_234_000);
  });

  it.each([{}, { exp: '1234' }, { exp: null }])(
    'returns undefined for payload %o',
    async payload => {
      await expect(
        getJwtExpiresAt({ token: createJwt(payload) }),
      ).resolves.toBeUndefined();
    },
  );
});
