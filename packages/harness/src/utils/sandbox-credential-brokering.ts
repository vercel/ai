import { randomBytes } from 'node:crypto';
import type { HarnessV1RequestTransformation } from '../v1';

const SANDBOX_CREDENTIAL_PLACEHOLDER_PREFIX = 'aisdkhc_';

export function generateSandboxCredentialPlaceholder(): string {
  return `${SANDBOX_CREDENTIAL_PLACEHOLDER_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function isSandboxCredentialPlaceholder(value: string): boolean {
  return /^aisdkhc_[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * Warns when credential brokering is unavailable, but only if real credentials
 * remain among the credentials forwarded into the sandbox.
 */
export function warnCredentialBrokeringUnavailable(options: {
  environment: Readonly<Record<string, string>>;
  forwardedEnvironment: Readonly<Record<string, string>>;
  credentialEnvironmentVariables: ReadonlyArray<string>;
}): void {
  const credentialEnvironmentVariables = [
    ...new Set(options.credentialEnvironmentVariables),
  ];
  const credentials = credentialEnvironmentVariables
    .map(name => options.environment[name])
    .filter(
      (credential): credential is string =>
        credential != null && credential.length > 0,
    );
  const forwardedCredentials = credentialEnvironmentVariables
    .map(name => options.forwardedEnvironment[name])
    .filter((credential): credential is string => credential != null);

  if (
    !credentials.some(credential =>
      forwardedCredentials.some(forwardedCredential =>
        forwardedCredential.includes(credential),
      ),
    )
  ) {
    return;
  }

  console.warn(
    'The sandbox implementation does not support configuring request transformations, so credential brokering does not work. Falling back to less secure credential forwarding.',
  );
}

export function maskSandboxCredentials({
  environment,
  credentialEnvironmentVariables,
}: {
  environment: Readonly<Record<string, string>>;
  credentialEnvironmentVariables: ReadonlyArray<string>;
}): Record<string, string> {
  const maskedEnvironment = { ...environment };
  for (const name of credentialEnvironmentVariables) {
    if (maskedEnvironment[name] != null) {
      maskedEnvironment[name] = name;
    }
  }
  return maskedEnvironment;
}

export function createCredentialRequestTransformation({
  matchUrl,
  matchHeaders,
  transformHeaders,
}: {
  matchUrl: string;
  matchHeaders: Readonly<Record<string, string>>;
  transformHeaders: Readonly<Record<string, string>>;
}): HarnessV1RequestTransformation {
  const url = new URL(matchUrl);
  const pathname = url.pathname.replace(/\/+$/, '');
  return {
    match: {
      host: url.hostname,
      ...(pathname.length === 0 ? {} : { path: { startsWith: pathname } }),
      headers: Object.entries(matchHeaders).map(([key, value]) => ({
        key: { exact: key },
        value: { exact: value },
      })),
    },
    transform: { headers: transformHeaders },
  };
}
