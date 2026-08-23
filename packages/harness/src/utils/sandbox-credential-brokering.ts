import type { HarnessV1RequestTransformation } from '../v1';

export function warnCredentialBrokeringUnavailable(): void {
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
  baseUrl,
  headers,
}: {
  baseUrl: string;
  headers: Readonly<Record<string, string>>;
}): HarnessV1RequestTransformation {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, '');
  return {
    match: {
      host: url.hostname,
      ...(pathname.length === 0 ? {} : { path: { startsWith: pathname } }),
    },
    transform: { headers },
  };
}
