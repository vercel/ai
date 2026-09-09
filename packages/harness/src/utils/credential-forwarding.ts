import type { HarnessV1CredentialForwarding } from '../v1';
import { generateSandboxCredentialPlaceholder } from './sandbox-credential-brokering';

export async function applyCredentialForwarding({
  environment,
  credentialEnvironmentVariables,
  credentialForwarding,
}: {
  environment: Readonly<Record<string, string>>;
  credentialEnvironmentVariables: ReadonlyArray<string>;
  credentialForwarding: HarnessV1CredentialForwarding | undefined;
}): Promise<Record<string, string>> {
  const forwardedEnvironment = { ...environment };
  if (credentialForwarding == null) return forwardedEnvironment;

  for (const environmentVariableName of new Set(
    credentialEnvironmentVariables,
  )) {
    const credential = forwardedEnvironment[environmentVariableName];
    if (credential == null) continue;

    forwardedEnvironment[environmentVariableName] = await credentialForwarding({
      credential,
      environmentVariableName,
    });
  }

  return forwardedEnvironment;
}

export async function createSandboxCredentialEnvironment({
  environment,
  credentialEnvironmentVariables,
  credentialForwarding,
}: {
  environment: Readonly<Record<string, string>>;
  credentialEnvironmentVariables: ReadonlyArray<string>;
  credentialForwarding: HarnessV1CredentialForwarding | undefined;
}): Promise<Record<string, string>> {
  const sandboxCredentialEnvironment: Record<string, string> = {};

  for (const environmentVariableName of new Set(
    credentialEnvironmentVariables,
  )) {
    if (environment[environmentVariableName] == null) continue;

    const placeholder = generateSandboxCredentialPlaceholder();
    sandboxCredentialEnvironment[environmentVariableName] =
      credentialForwarding == null
        ? placeholder
        : await credentialForwarding({
            credential: placeholder,
            environmentVariableName,
          });
  }

  return sandboxCredentialEnvironment;
}
