import { describe, it, expect } from 'vitest';
import {
  extractResourceMetadataUrl,
  type OAuthClientProvider,
  type AuthResult,
} from './oauth';

const makeResponse = (status: number, headers: Record<string, string>): Response =>
  new Response('', { status, headers });

describe('extractResourceMetadataUrl', () => {
  it('extracts URL from WWW-Authenticate resource parameter', () => {
    const url = 'https://mcp.example.com/.well-known/oauth-protected-resource';
    const response = makeResponse(401, {
      'WWW-Authenticate': `Bearer resource="${url}"`,
    });

    const result = extractResourceMetadataUrl(response);
    expect(result).toBeInstanceOf(URL);
    expect(result?.href).toBe(`${url}`);
  });

  it('returns undefined when header is missing', () => {
    const response = makeResponse(401, {});
    const result = extractResourceMetadataUrl(response);
    expect(result).toBeUndefined();
  });

  it('returns undefined when resource parameter is missing', () => {
    const response = makeResponse(401, {
      'WWW-Authenticate': 'Bearer error=',
    });
    const result = extractResourceMetadataUrl(response);
    expect(result).toBeUndefined();
  });

  it('returns undefined when resource parameter is not a valid URL', () => {
    const url = 'www.mcp.example.com/.well-known/oauth-protected-resource'; // invalid url example (missing https://)
    const response = makeResponse(401, {
      'WWW-Authenticate': `Bearer resource="${url}"`,
    });
    const result = extractResourceMetadataUrl(response);
    expect(result).toBeUndefined();
  });
});


describe('OAuthClientProvider (example implementation)', () => {
  class MemoryOAuthProvider implements OAuthClientProvider {
    private token?: string;

    async tokens(): Promise<{ access_token: string } | null> {
      return this.token ? { access_token: this.token } : null;
    }

    async authorize(options: {
      serverUrl: URL;
      resourceMetadataUrl?: URL;
    }): Promise<AuthResult> {
      this.token = `test-token-${options.serverUrl.host}`;
      return 'AUTHORIZED';
    }
  }

  it('returns null before authorize and a token after authorize', async () => {
    const provider = new MemoryOAuthProvider();

    const before = await provider.tokens();
    expect(before).toBeNull();

    const result = await provider.authorize({
      serverUrl: new URL('https://mcp.example.com'),
    });
    expect(result).toBe('AUTHORIZED');

    const after = await provider.tokens();
    expect(after).not.toBeNull();
    expect(after?.access_token).toBe('test-token-mcp.example.com');
  });
});