import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  isHarnessAuthenticationEnvironment,
  shouldResolveNativeSubscription,
} from '@ai-sdk/harness/utils';
import {
  Llms,
  ProviderSettingsManager,
  RuntimeOAuthTokenManager,
} from '@cline/core';
import { resolveClineEnv, type ClineAuthenticationMode } from './cline-auth';

export type ClineResolvedAuthentication = {
  readonly environment: Record<string, string>;
  readonly subscriptionApiKey?: string;
};

export async function resolveClineAuthentication({
  auth,
  env = process.env,
  providerId = 'cline',
  apiKey,
  readSubscription = readClineSubscription,
}: {
  auth?: ClineAuthenticationMode;
  env?: Record<string, string | undefined>;
  providerId?: string;
  apiKey?: string;
  readSubscription?: (options: {
    providerId: string;
    env: Record<string, string | undefined>;
  }) => Promise<string | undefined>;
}): Promise<ClineResolvedAuthentication> {
  const environment = resolveClineEnv({ auth, env });
  if (isHarnessAuthenticationEnvironment(auth)) {
    return { environment };
  }
  if (
    !shouldResolveNativeSubscription({
      auth,
      env: environment,
      hasDirectCredential:
        apiKey != null || hasApplicableProviderApiKey({ providerId, env }),
    })
  ) {
    return { environment };
  }

  const subscriptionApiKey = await readSubscription({ providerId, env });
  return subscriptionApiKey == null
    ? { environment }
    : { environment, subscriptionApiKey };
}

export async function readClineSubscription({
  providerId,
  env = process.env,
  homeDirectory = homedir(),
}: {
  providerId: string;
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
}): Promise<string | undefined> {
  const filePath = resolveClineProviderSettingsPath({
    env,
    homeDirectory,
  });
  const manager = new ProviderSettingsManager({ filePath });
  const entry = manager.read().providers[providerId];
  if (entry?.tokenSource !== 'oauth') return undefined;
  const resolution = await new RuntimeOAuthTokenManager({
    providerSettingsManager: manager,
  }).resolveProviderApiKey({ providerId });
  return resolution?.apiKey;
}

export function resolveClineProviderSettingsPath({
  env,
  homeDirectory,
}: {
  env: Record<string, string | undefined>;
  homeDirectory: string;
}): string {
  const explicitPath = env.CLINE_PROVIDER_SETTINGS_PATH?.trim();
  if (explicitPath) return resolve(explicitPath);
  const dataDirectory = env.CLINE_DATA_DIR?.trim();
  return join(
    dataDirectory
      ? resolve(dataDirectory)
      : join(homeDirectory, '.cline', 'data'),
    'settings',
    'providers.json',
  );
}

function hasApplicableProviderApiKey({
  providerId,
  env,
}: {
  providerId: string;
  env: Record<string, string | undefined>;
}): boolean {
  if (providerId === 'cline' && env.CLINE_API_KEY != null) return true;
  return (
    Llms.getProviderCollectionSync(providerId)?.provider.env?.some(
      name => env[name] != null,
    ) ?? false
  );
}
