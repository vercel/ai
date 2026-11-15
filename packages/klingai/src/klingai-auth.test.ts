import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateKlingAIAuthToken,
  resolveKlingAIAuthToken,
} from './klingai-auth';

const decodePayload = (token: string) =>
  JSON.parse(
    atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
  ) as { iss: string; exp: number; nbf: number };

describe('resolveKlingAIAuthToken', () => {
  beforeEach(() => {
    vi.stubEnv('KLINGAI_API_KEY', undefined as unknown as string);
    vi.stubEnv('KLINGAI_ACCESS_KEY', undefined as unknown as string);
    vi.stubEnv('KLINGAI_SECRET_KEY', undefined as unknown as string);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return the api key verbatim when passed explicitly', async () => {
    await expect(
      resolveKlingAIAuthToken({ apiKey: 'test-api-key' }),
    ).resolves.toBe('test-api-key');
  });

  it('should trim the api key', async () => {
    await expect(
      resolveKlingAIAuthToken({ apiKey: '  test-api-key  ' }),
    ).resolves.toBe('test-api-key');
  });

  it('should load the api key from the environment', async () => {
    vi.stubEnv('KLINGAI_API_KEY', 'env-api-key');

    await expect(resolveKlingAIAuthToken({})).resolves.toBe('env-api-key');
  });

  it('should prefer an explicit api key over the environment variable', async () => {
    vi.stubEnv('KLINGAI_API_KEY', 'env-api-key');

    await expect(
      resolveKlingAIAuthToken({ apiKey: 'explicit-api-key' }),
    ).resolves.toBe('explicit-api-key');
  });

  it('should prefer an explicit api key over explicit legacy credentials', async () => {
    const token = await resolveKlingAIAuthToken({
      apiKey: 'explicit-api-key',
      accessKey: 'test-ak',
      secretKey: 'test-sk',
    });

    expect(token).toBe('explicit-api-key');
  });

  it('should prefer explicit legacy credentials over the api key environment variable', async () => {
    vi.stubEnv('KLINGAI_API_KEY', 'env-api-key');

    const token = await resolveKlingAIAuthToken({
      accessKey: 'test-ak',
      secretKey: 'test-sk',
    });

    expect(token.split('.')).toHaveLength(3);
    expect(decodePayload(token).iss).toBe('test-ak');
  });

  it('should prefer the api key environment variable over legacy environment variables', async () => {
    vi.stubEnv('KLINGAI_API_KEY', 'env-api-key');
    vi.stubEnv('KLINGAI_ACCESS_KEY', 'env-access-key');
    vi.stubEnv('KLINGAI_SECRET_KEY', 'env-secret-key');

    await expect(resolveKlingAIAuthToken({})).resolves.toBe('env-api-key');
  });

  it('should fall back to a signed JWT when only legacy environment variables are set', async () => {
    vi.stubEnv('KLINGAI_ACCESS_KEY', 'env-access-key');
    vi.stubEnv('KLINGAI_SECRET_KEY', 'env-secret-key');

    const token = await resolveKlingAIAuthToken({});

    expect(token.split('.')).toHaveLength(3);
    expect(decodePayload(token).iss).toBe('env-access-key');
  });

  it('should ignore a blank api key and fall back to legacy credentials', async () => {
    vi.stubEnv('KLINGAI_API_KEY', '   ');
    vi.stubEnv('KLINGAI_ACCESS_KEY', 'env-access-key');
    vi.stubEnv('KLINGAI_SECRET_KEY', 'env-secret-key');

    const token = await resolveKlingAIAuthToken({});

    expect(decodePayload(token).iss).toBe('env-access-key');
  });

  it('should throw an api-key-centric error when no credentials are available', async () => {
    await expect(resolveKlingAIAuthToken({})).rejects.toThrow(
      /KlingAI API key is missing.*'apiKey'.*KLINGAI_API_KEY/s,
    );
  });

  it('should still report the missing secret key when only an access key is set', async () => {
    vi.stubEnv('KLINGAI_ACCESS_KEY', 'env-access-key');

    await expect(resolveKlingAIAuthToken({})).rejects.toThrow(
      'KlingAI secret key',
    );
  });
});

describe('generateKlingAIAuthToken', () => {
  beforeEach(() => {
    vi.stubEnv('KLINGAI_ACCESS_KEY', undefined as unknown as string);
    vi.stubEnv('KLINGAI_SECRET_KEY', undefined as unknown as string);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should generate a valid JWT token structure', async () => {
    const token = await generateKlingAIAuthToken({
      accessKey: 'test-access-key',
      secretKey: 'test-secret-key',
    });

    // JWT should have 3 parts separated by dots
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('should include correct header with HS256 algorithm', async () => {
    const token = await generateKlingAIAuthToken({
      accessKey: 'test-access-key',
      secretKey: 'test-secret-key',
    });

    const [headerPart] = token.split('.');
    // Decode base64url to get header JSON
    const header = JSON.parse(
      atob(headerPart.replace(/-/g, '+').replace(/_/g, '/')),
    );

    expect(header).toStrictEqual({
      alg: 'HS256',
      typ: 'JWT',
    });
  });

  it('should include issuer (iss) matching the access key', async () => {
    const token = await generateKlingAIAuthToken({
      accessKey: 'my-access-key-123',
      secretKey: 'my-secret-key',
    });

    const [, payloadPart] = token.split('.');
    const payload = JSON.parse(
      atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')),
    );

    expect(payload.iss).toBe('my-access-key-123');
  });

  it('should include exp and nbf claims', async () => {
    const token = await generateKlingAIAuthToken({
      accessKey: 'test-ak',
      secretKey: 'test-sk',
    });

    const [, payloadPart] = token.split('.');
    const payload = JSON.parse(
      atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')),
    );

    expect(payload.exp).toBeDefined();
    expect(payload.nbf).toBeDefined();
    // exp should be approximately 30 minutes from now
    expect(payload.exp - payload.nbf).toBeGreaterThan(1800 - 10);
    expect(payload.exp - payload.nbf).toBeLessThan(1800 + 10);
  });

  it('should load access key from environment variable', async () => {
    vi.stubEnv('KLINGAI_ACCESS_KEY', 'env-access-key');

    const token = await generateKlingAIAuthToken({
      secretKey: 'test-sk',
    });

    const [, payloadPart] = token.split('.');
    const payload = JSON.parse(
      atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')),
    );

    expect(payload.iss).toBe('env-access-key');
  });

  it('should prefer explicit accessKey over environment variable', async () => {
    vi.stubEnv('KLINGAI_ACCESS_KEY', 'env-access-key');

    const token = await generateKlingAIAuthToken({
      accessKey: 'explicit-access-key',
      secretKey: 'test-sk',
    });

    const [, payloadPart] = token.split('.');
    const payload = JSON.parse(
      atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')),
    );

    expect(payload.iss).toBe('explicit-access-key');
  });

  it('should throw when access key is not available', async () => {
    await expect(
      generateKlingAIAuthToken({
        secretKey: 'test-sk',
      }),
    ).rejects.toThrow('KlingAI access key');
  });

  it('should throw when secret key is not available', async () => {
    await expect(
      generateKlingAIAuthToken({
        accessKey: 'test-ak',
      }),
    ).rejects.toThrow('KlingAI secret key');
  });

  it('should produce different tokens for different secret keys', async () => {
    const token1 = await generateKlingAIAuthToken({
      accessKey: 'same-ak',
      secretKey: 'secret-key-1',
    });

    const token2 = await generateKlingAIAuthToken({
      accessKey: 'same-ak',
      secretKey: 'secret-key-2',
    });

    // Signatures should differ
    const sig1 = token1.split('.')[2];
    const sig2 = token2.split('.')[2];
    expect(sig1).not.toBe(sig2);
  });
});
