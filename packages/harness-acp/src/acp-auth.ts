import { createHash } from 'node:crypto';
import {
  getAiGatewayAuthFromEnv,
  isHarnessAuthenticationEnvironment,
} from '@ai-sdk/harness/utils';
import type {
  ACPAuthentication,
  ACPAuthenticationMode as ACPV1AuthenticationMode,
  ACPProviderAuthentication,
} from './v1';
import type { ACPResolvedProviderAuthentication } from './v1/bridge/acp-v1-bridge-environment';

const DEFAULT_AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh';

export type ACPAuthenticationMode = ACPV1AuthenticationMode;

export type ACPClientApp = {
  readonly name: string;
  readonly version: string;
};

type ACPAuthResolutionOptions = {
  readonly mode?: ACPAuthenticationMode;
  readonly providerAuthentication: ACPProviderAuthentication | undefined;
  readonly clientApp: ACPClientApp;
};

type ACPGatewayCredentialSource = 'AI_GATEWAY_API_KEY' | 'VERCEL_OIDC_TOKEN';

export type ACPProviderAuthenticationCompatibility =
  | {
      readonly type: 'direct';
      readonly mode: 'auto' | 'direct';
    }
  | {
      readonly type: 'ai-gateway';
      readonly mode: 'auto' | 'ai-gateway';
      readonly env: ACPProviderAuthentication['gateway']['env'];
      readonly credentialSource: ACPGatewayCredentialSource | null;
      readonly baseUrl: string;
    };

export type ACPAuthenticationProfileIdentity = {
  readonly digest: string;
  readonly acpMethodId?: string;
  readonly providerKind: 'direct' | 'ai-gateway';
  readonly providerMode?: 'auto' | 'direct' | 'ai-gateway';
  readonly gatewayCredentialSource?:
    | 'AI_GATEWAY_API_KEY'
    | 'VERCEL_OIDC_TOKEN'
    | null;
};

export function createACPAuthenticationProfileIdentity({
  authentication,
  providerAuthenticationCompatibility,
}: {
  authentication: ACPAuthentication | undefined;
  providerAuthenticationCompatibility:
    | ACPProviderAuthenticationCompatibility
    | undefined;
}): ACPAuthenticationProfileIdentity {
  const providerKind = providerAuthenticationCompatibility?.type ?? 'direct';
  const digest = createHash('sha256')
    .update(
      stableStringify({
        value: {
          authentication: authentication ?? null,
          providerAuthentication: providerAuthenticationCompatibility ?? null,
        },
      }),
    )
    .digest('hex');
  return {
    digest,
    ...(authentication == null ? {} : { acpMethodId: authentication.methodId }),
    providerKind,
    ...(providerAuthenticationCompatibility == null
      ? {}
      : { providerMode: providerAuthenticationCompatibility.mode }),
    ...(providerAuthenticationCompatibility?.type === 'ai-gateway'
      ? {
          gatewayCredentialSource:
            providerAuthenticationCompatibility.credentialSource,
        }
      : {}),
  };
}

export function resolveACPProviderAuthentication({
  auth,
  env,
  compatibility,
}: {
  auth: ACPAuthResolutionOptions;
  env: Record<string, string | undefined>;
  compatibility?: ACPProviderAuthenticationCompatibility;
}): {
  readonly providerAuthentication:
    | ACPResolvedProviderAuthentication
    | undefined;
  readonly env: Record<string, string>;
} {
  const clientAppEnv = {
    AI_SDK_ACP_CLIENT_APP_NAME: auth.clientApp.name,
    AI_SDK_ACP_CLIENT_APP_VERSION: auth.clientApp.version,
  };
  const resolvedEnv = resolveACPAuthenticationEnvironment({
    auth: auth.mode,
    env,
  });
  const providerAuthentication = auth.providerAuthentication;
  if (providerAuthentication == null) {
    return { providerAuthentication: undefined, env: clientAppEnv };
  }

  if (compatibility?.type === 'direct') {
    return {
      providerAuthentication: { type: 'direct' },
      env: clientAppEnv,
    };
  }

  const mode = resolveACPProviderAuthenticationMode(auth.mode);
  if (mode === 'direct') {
    return {
      providerAuthentication: { type: 'direct' },
      env: clientAppEnv,
    };
  }

  const gateway =
    compatibility?.type === 'ai-gateway'
      ? {
          apiKey: resolveGatewayCredential({
            env: resolvedEnv,
            credentialSource: compatibility.credentialSource,
          }),
          baseUrl: compatibility.baseUrl,
        }
      : getAiGatewayAuthFromEnv({ env: resolvedEnv });
  const apiKey = gateway.apiKey;
  if (compatibility == null && mode === 'auto' && apiKey == null) {
    return {
      providerAuthentication: { type: 'direct' },
      env: clientAppEnv,
    };
  }
  if (apiKey == null) {
    throw new Error(
      'AI Gateway authentication was selected, but neither AI_GATEWAY_API_KEY nor VERCEL_OIDC_TOKEN is set.',
    );
  }

  return {
    providerAuthentication: {
      type: 'ai-gateway',
      env:
        compatibility?.type === 'ai-gateway'
          ? compatibility.env
          : providerAuthentication.gateway.env,
    },
    env: {
      AI_SDK_ACP_GATEWAY_API_KEY: apiKey,
      AI_SDK_ACP_GATEWAY_BASE_URL: gateway.baseUrl,
      ...clientAppEnv,
    },
  };
}

export function resolveACPProviderAuthenticationCompatibility({
  auth = 'auto',
  providerAuthentication,
  env,
}: {
  auth?: ACPAuthenticationMode;
  providerAuthentication: ACPProviderAuthentication | undefined;
  env: Record<string, string | undefined>;
}): ACPProviderAuthenticationCompatibility | undefined {
  const resolvedEnv = resolveACPAuthenticationEnvironment({
    auth,
    env,
  });
  if (providerAuthentication == null) return undefined;

  const mode = resolveACPProviderAuthenticationMode(auth);
  if (mode === 'direct') {
    return { type: 'direct', mode };
  }

  const credentialSource = resolveGatewayCredentialSource({ env: resolvedEnv });
  if (mode === 'auto' && credentialSource == null) {
    return { type: 'direct', mode };
  }

  return {
    type: 'ai-gateway',
    mode,
    env: providerAuthentication.gateway.env,
    credentialSource,
    baseUrl: resolvedEnv.AI_GATEWAY_BASE_URL ?? DEFAULT_AI_GATEWAY_BASE_URL,
  };
}

function resolveACPProviderAuthenticationMode(
  auth: ACPAuthenticationMode | undefined,
): Extract<ACPAuthenticationMode, string> {
  return typeof auth === 'string' || auth == null ? (auth ?? 'auto') : 'auto';
}

export function resolveACPAuthenticationEnvironment({
  auth,
  env,
}: {
  auth: ACPAuthenticationMode | undefined;
  env: Record<string, string | undefined>;
}): Record<string, string | undefined> {
  return isHarnessAuthenticationEnvironment(auth) ? auth : env;
}

export function resolveACPEnv({
  auth,
  env,
}: {
  auth: ACPAuthResolutionOptions;
  env: Record<string, string | undefined>;
}): Record<string, string> {
  return resolveACPProviderAuthentication({ auth, env }).env;
}

function resolveGatewayCredentialSource({
  env,
}: {
  env: Record<string, string | undefined>;
}): ACPGatewayCredentialSource | null {
  return env.AI_GATEWAY_API_KEY
    ? 'AI_GATEWAY_API_KEY'
    : env.VERCEL_OIDC_TOKEN
      ? 'VERCEL_OIDC_TOKEN'
      : null;
}

function resolveGatewayCredential({
  env,
  credentialSource,
}: {
  env: Record<string, string | undefined>;
  credentialSource: ACPGatewayCredentialSource | null;
}): string | undefined {
  const gatewayFromEnv = getAiGatewayAuthFromEnv({ env });
  switch (credentialSource) {
    case 'AI_GATEWAY_API_KEY':
      return env.AI_GATEWAY_API_KEY == null ? undefined : gatewayFromEnv.apiKey;
    case 'VERCEL_OIDC_TOKEN':
      return getAiGatewayAuthFromEnv({
        env: { VERCEL_OIDC_TOKEN: env.VERCEL_OIDC_TOKEN },
      }).apiKey;
    case null:
      return undefined;
  }
}

function stableStringify({ value }: { value: unknown }): string {
  return JSON.stringify(sortIdentityValue({ value }));
}

function sortIdentityValue({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sortIdentityValue({ value: item }));
  }
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, sortIdentityValue({ value: entry })]),
    );
  }
  return value;
}
