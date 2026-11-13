import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthTokens,
} from '@ai-sdk/mcp';
import { randomUUID } from 'node:crypto';

export const sessionCookieName = 'mcp-oauth-session';
export const sessionMaxAge = 30 * 60;

// Each browser session owns one provider for this fixed MCP resource. The SDK
// additionally pins client information and tokens to their authorization issuer.
export class SessionOAuthProvider implements OAuthClientProvider {
  readonly serverUrl = new URL('https://mcp.vercel.com/');
  private savedTokens?: OAuthTokens;
  private savedClientInformation?: OAuthClientInformation;
  private savedCodeVerifier?: string;
  private savedState?: string;
  pendingAuthorization?: { url: string; expiresAt: number };

  constructor(readonly redirectUrl: string) {}

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'AI SDK MCP OAuth Example (Next.js)',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    };
  }

  tokens() {
    return this.savedTokens;
  }

  saveTokens(tokens: OAuthTokens) {
    this.savedTokens = tokens;
  }

  clientInformation() {
    return this.savedClientInformation;
  }

  saveClientInformation(info: OAuthClientInformation) {
    this.savedClientInformation = info;
  }

  isClientInformationDynamicallyRegistered() {
    return true;
  }

  saveCodeVerifier(verifier: string) {
    this.savedCodeVerifier = verifier;
  }

  codeVerifier() {
    if (!this.savedCodeVerifier) throw new Error('No code verifier saved');
    return this.savedCodeVerifier;
  }

  state() {
    return randomUUID();
  }

  saveState(state: string) {
    this.savedState = state;
  }

  storedState() {
    return this.savedState;
  }

  redirectToAuthorization(url: URL) {
    this.pendingAuthorization = {
      url: url.toString(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
  }

  clearAuthorization() {
    this.savedState = undefined;
    this.savedCodeVerifier = undefined;
    this.pendingAuthorization = undefined;
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier') {
    if (scope === 'all' || scope === 'tokens') this.savedTokens = undefined;
    if (scope === 'all' || scope === 'client')
      this.savedClientInformation = undefined;
    if (scope === 'all' || scope === 'verifier') this.clearAuthorization();
  }
}

type OAuthSession = {
  origin: string;
  provider: SessionOAuthProvider;
  expiresAt: number;
  busy: boolean;
};

// Local demonstration only: no durable storage or application login system.
// The API rejects hosted/production requests before accessing this store.
const sessions = new Map<string, OAuthSession>();

export function requestOrigin(request: Request) {
  return `${new URL(request.url).protocol}//${request.headers.get('host')}`;
}

export function getOAuthSession(request: Request) {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(id);
  }

  const cookies = (request.headers.get('cookie') ?? '')
    .split(';')
    .map(cookie => cookie.trim())
    .filter(cookie => cookie.startsWith(`${sessionCookieName}=`));
  if (cookies.length !== 1) return;

  const session = sessions.get(cookies[0].slice(sessionCookieName.length + 1));
  return session?.origin === requestOrigin(request) ? session : undefined;
}

export function createOAuthSession(request: Request) {
  if (sessions.size >= 100) return;

  const id = randomUUID();
  const origin = requestOrigin(request);
  sessions.set(id, {
    origin,
    provider: new SessionOAuthProvider(
      `${origin}/api/chat/mcp-with-auth?callback=1`,
    ),
    expiresAt: Date.now() + sessionMaxAge * 1000,
    busy: false,
  });
  return id;
}
