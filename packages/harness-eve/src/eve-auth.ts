import type {
  ClientAuth,
  ClientOptions,
  ClientRedirectPolicy,
  HeadersValue,
  TokenValue,
} from 'eve/client';
import {
  vercelOidc as createEveVercelOidcAuth,
  type VercelOidcOptions,
} from 'eve/agents/auth';

export type EveAuthOptions =
  | 'auto'
  | 'none'
  | ({
      readonly type: 'vercel-oidc';
      readonly token?: TokenValue;
    } & VercelOidcOptions)
  | { readonly type: 'bearer'; readonly token: TokenValue }
  | {
      readonly type: 'basic';
      readonly username: string;
      readonly password: TokenValue;
    };

export type EveClientSettings = {
  readonly url: string | URL;
  readonly auth?: EveAuthOptions;
  readonly headers?: HeadersValue;
  readonly redirect?: ClientRedirectPolicy;
  readonly maxReconnectAttempts?: number;
  readonly preserveCompletedSessions?: boolean;
};

type Env = {
  readonly VERCEL_AUTOMATION_BYPASS_SECRET?: string;
  readonly VERCEL_OIDC_TOKEN?: string;
};

const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';

export function resolveEveClientOptions({
  settings,
  env = process.env,
}: {
  readonly settings: EveClientSettings;
  readonly env?: Env;
}): ClientOptions {
  const host =
    typeof settings.url === 'string' ? settings.url : settings.url.toString();
  const auth = resolveEveAuth({ auth: settings.auth, env, host });
  const headers = resolveEveHeaders({ env, headers: settings.headers });
  return {
    host,
    ...(auth ? { auth } : {}),
    ...(headers ? { headers } : {}),
    ...(settings.redirect || auth
      ? { redirect: settings.redirect ?? 'manual' }
      : {}),
    ...(settings.maxReconnectAttempts != null
      ? { maxReconnectAttempts: settings.maxReconnectAttempts }
      : {}),
    preserveCompletedSessions: settings.preserveCompletedSessions ?? true,
  };
}

function resolveEveHeaders({
  env,
  headers,
}: {
  readonly env: Env;
  readonly headers?: HeadersValue;
}): HeadersValue | undefined {
  const bypassSecret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!bypassSecret) {
    return headers;
  }

  const bypassHeaders = {
    [VERCEL_PROTECTION_BYPASS_HEADER]: bypassSecret,
  };

  if (headers == null) {
    return bypassHeaders;
  }

  return async () => ({
    ...bypassHeaders,
    ...(typeof headers === 'function' ? await headers() : headers),
  });
}

function resolveEveAuth({
  auth = 'auto',
  env,
  host,
}: {
  readonly auth: EveAuthOptions | undefined;
  readonly env: Env;
  readonly host: string;
}): ClientAuth | undefined {
  if (auth === 'none') {
    return undefined;
  }

  if (auth === 'auto') {
    if (!env.VERCEL_OIDC_TOKEN) {
      if (isLocalUrl({ url: host })) {
        return undefined;
      }
    }

    return {
      vercelOidc: {
        token: createVercelOidcTokenResolver({}),
      },
    };
  }

  switch (auth.type) {
    case 'vercel-oidc':
      return {
        vercelOidc: {
          token: auth.token ?? createVercelOidcTokenResolver({ options: auth }),
        },
      };
    case 'bearer':
      return { bearer: auth.token };
    case 'basic':
      return {
        basic: {
          username: auth.username,
          password: auth.password,
        },
      };
  }
}

function createVercelOidcTokenResolver({
  options = {},
}: {
  readonly options?: VercelOidcOptions;
}): () => Promise<string> {
  const auth = createEveVercelOidcAuth({
    ...(options.expirationBufferMs !== undefined
      ? { expirationBufferMs: options.expirationBufferMs }
      : {}),
    ...(options.project !== undefined ? { project: options.project } : {}),
    ...(options.team !== undefined ? { team: options.team } : {}),
  });

  return async () => {
    const { headers } = await auth();
    const authorization = findHeader({
      headers,
      name: 'authorization',
    })?.trim();
    const match = /^Bearer\s+(.+)$/iu.exec(authorization ?? '');
    if (!match) {
      throw new Error('Eve Vercel OIDC auth did not return a bearer token.');
    }
    return match[1]!.trim();
  };
}

function findHeader({
  headers,
  name,
}: {
  readonly headers: Readonly<Record<string, string>>;
  readonly name: string;
}): string | undefined {
  const normalizedName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalizedName) {
      return value;
    }
  }
  return undefined;
}

function isLocalUrl({ url }: { readonly url: string }): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    );
  } catch {
    return false;
  }
}
