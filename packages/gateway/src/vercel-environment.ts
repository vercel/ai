import { GatewayAuthenticationError } from './errors';

export async function getVercelOidcToken(): Promise<string> {
  const token =
    getContext().headers?.['x-vercel-oidc-token'] ??
    process.env.VERCEL_OIDC_TOKEN;

  if (!token) {
    throw new GatewayAuthenticationError({
      message: `Failed to get Vercel OIDC token for AI Gateway access.
The token is expected to be provided via the 'VERCEL_OIDC_TOKEN' environment variable. It expires every 12 hours.
- make sure your Vercel project settings have OIDC enabled
- if you're running locally with 'vercel dev' the token is automatically obtained and refreshed for you
- if you're running locally with your own dev server script you can fetch/update the token by running 'vercel env pull'
- in production or preview the token is automatically obtained and refreshed for you`,
      statusCode: 401,
    });
  }

  return token;
}

export async function getVercelRequestId(): Promise<string | undefined> {
  return getContext().headers?.['x-vercel-id'];
}

type Context = {
  headers?: Record<string, string>;
};

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

function getContext(): Context {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}
