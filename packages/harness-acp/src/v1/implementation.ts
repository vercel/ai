import { createHash } from 'node:crypto';
import type {
  ACPClientApp,
  ACPProviderAuthenticationCompatibility,
} from '../acp-auth';
import type {
  ACPModelMapping,
  ACPNpmSimpleSource,
  ACPPermissionModeMapping,
  ACPSerializableValue,
  ACPSource,
  ACPV1Settings,
} from './acp-v1-settings';

/*
 * Launch descriptor assembled from the launch-related settings fields. The
 * fields are declared here rather than derived from ACPV1Settings so that the
 * settings type stays free to describe the configuration surface while this
 * type describes what the bootstrap, install, and identity logic consume. The
 * two shapes are required to agree, and createACPV1Implementation is the only
 * place that maps between them.
 */
export type ACPImplementation = {
  readonly source: ACPSource;
  readonly executable: string;
  readonly args?: ReadonlyArray<string>;
  readonly forwardEnv?: ReadonlyArray<string>;
  readonly credentialEnv?: ReadonlyArray<string>;
  readonly env?: Readonly<Record<string, string>>;
};

export function createACPV1Implementation({
  settings,
}: {
  settings: ACPV1Settings;
}): ACPImplementation {
  return {
    source: settings.source,
    executable: settings.executable,
    args: settings.args,
    forwardEnv: settings.forwardEnv,
    credentialEnv: settings.credentialEnv,
    env: settings.env,
  };
}

const EXACT_SEMVER_REGEXP =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PACKAGE_NAME_REGEXP =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const EXECUTABLE_NAME_REGEXP = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ENVIRONMENT_VARIABLE_NAME_REGEXP = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateACPV1Implementation(
  implementation: ACPImplementation,
): void {
  const { source } = implementation;
  if (source.type === 'npm-locked') {
    if (source.packageJson.length === 0) {
      throw new Error('ACP source.packageJson must not be empty.');
    }
    if (source.pnpmLockYaml.length === 0) {
      throw new Error('ACP source.pnpmLockYaml must not be empty.');
    }
    if (source.pnpmWorkspaceYaml?.length === 0) {
      throw new Error('ACP source.pnpmWorkspaceYaml must not be empty.');
    }
  } else if (source.type === 'npm-simple') {
    validateNpmSimpleSource({ source });
  } else if (source.command.trim().length === 0) {
    throw new Error('ACP source.command must not be empty.');
  }
  if (!EXECUTABLE_NAME_REGEXP.test(implementation.executable)) {
    throw new Error(
      `ACP executable must be a bare command name without a path; received ${JSON.stringify(implementation.executable)}.`,
    );
  }

  validateForwardEnvironment({ forwardEnv: implementation.forwardEnv });
  validateForwardEnvironment({ forwardEnv: implementation.credentialEnv });
  validateEnvironment({ env: implementation.env });
  const forwardedKeys = new Set(implementation.forwardEnv ?? []);
  const credentialKeys = new Set(implementation.credentialEnv ?? []);
  for (const key of credentialKeys) {
    if (forwardedKeys.has(key)) {
      throw new Error(
        `ACP runtime environment key ${JSON.stringify(key)} cannot be configured in both forwardEnv and credentialEnv.`,
      );
    }
  }
  for (const key of Object.keys(implementation.env ?? {})) {
    if (forwardedKeys.has(key)) {
      throw new Error(
        `ACP runtime environment key ${JSON.stringify(key)} cannot be configured in both forwardEnv and env.`,
      );
    }
    if (credentialKeys.has(key)) {
      throw new Error(
        `ACP runtime environment key ${JSON.stringify(key)} cannot be configured in both credentialEnv and env.`,
      );
    }
  }
}

export function createImplementationManifest({
  implementation,
}: {
  implementation: ACPImplementation;
}): string | undefined {
  const { source } = implementation;
  if (source.type === 'install-command') return undefined;
  if (source.type === 'npm-locked') {
    return source.packageJson;
  }
  return (
    JSON.stringify(
      {
        name: 'harness-acp-implementation',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          [source.packageName]: source.packageVersion ?? 'latest',
        },
      },
      null,
      2,
    ) + '\n'
  );
}

export function getImplementationLockfile({
  implementation,
}: {
  implementation: ACPImplementation;
}): string | undefined {
  const { source } = implementation;
  return source.type === 'npm-locked' ? source.pnpmLockYaml : undefined;
}

export function getImplementationWorkspaceFile({
  implementation,
}: {
  implementation: ACPImplementation;
}): string | undefined {
  const { source } = implementation;
  return source.type === 'npm-locked' ? source.pnpmWorkspaceYaml : undefined;
}

export function createImplementationDescriptor({
  implementation,
}: {
  implementation: ACPImplementation;
}): string {
  return (
    JSON.stringify(
      {
        executablePath:
          implementation.source.type === 'install-command'
            ? `home/.local/bin/${implementation.executable}`
            : `node_modules/.bin/${implementation.executable}`,
        privateHome: implementation.source.type === 'install-command',
        args: implementation.args ?? [],
        envKeys: getImplementationEnvironmentKeys({ implementation }),
      },
      null,
      2,
    ) + '\n'
  );
}

export function createImplementationIdentity({
  harnessId,
  acpVersion,
  implementation,
  clientApp,
  clientCapabilities,
  modelMapping,
  providerAuthentication,
  permissionModeMapping,
}: {
  harnessId: string;
  acpVersion: 'v1';
  implementation: ACPImplementation;
  clientApp: ACPClientApp;
  clientCapabilities?: Readonly<Record<string, ACPSerializableValue>>;
  modelMapping: ACPModelMapping;
  providerAuthentication: ACPProviderAuthenticationCompatibility | undefined;
  permissionModeMapping?: ACPPermissionModeMapping;
}): string {
  const { source } = implementation;
  const sourceIdentity =
    source.type === 'npm-locked'
      ? {
          type: source.type,
          packageJson: source.packageJson,
          pnpmLockYaml: source.pnpmLockYaml,
          pnpmWorkspaceYaml: source.pnpmWorkspaceYaml,
        }
      : source.type === 'npm-simple'
        ? {
            type: source.type,
            packageName: source.packageName,
            ...(source.packageVersion == null
              ? {}
              : { packageVersion: source.packageVersion }),
          }
        : {
            type: source.type,
            command: source.command,
          };
  const forwardedEnvironment = [
    ...new Set(implementation.forwardEnv ?? []),
  ].sort();
  const credentialEnvironment = [
    ...new Set(implementation.credentialEnv ?? []),
  ].sort();
  const literalEnvironment = Object.fromEntries(
    Object.entries(implementation.env ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, { value }]),
  );
  const payload = {
    harnessId,
    acpVersion,
    source: sourceIdentity,
    executable: implementation.executable,
    args: implementation.args ?? [],
    clientApp,
    clientCapabilities: clientCapabilities ?? null,
    modelMapping,
    environment: {
      forwarded: forwardedEnvironment,
      credential: credentialEnvironment,
      literal: literalEnvironment,
    },
    providerAuthentication: providerAuthentication ?? null,
    permissionModeMapping: permissionModeMapping ?? null,
  };
  return createHash('sha256')
    .update(stableStringify({ value: payload }))
    .digest('hex');
}

export function createImplementationInstallCommand({
  implementationDir,
  storeDir,
  implementation,
}: {
  implementationDir: string;
  storeDir: string;
  implementation: ACPImplementation;
}): string {
  if (implementation.source.type === 'install-command') {
    return 'bash implementation/install.sh';
  }
  return (
    `pnpm --dir ${implementationDir} install` +
    (implementation.source.type === 'npm-locked' ? ' --frozen-lockfile' : '') +
    ` --prod --store-dir ${storeDir}`
  );
}

export function getImplementationInstallScript({
  implementation,
}: {
  implementation: ACPImplementation;
}): string | undefined {
  if (implementation.source.type !== 'install-command') return undefined;
  return `#!/usr/bin/env bash
set -euo pipefail

ACP_IMPLEMENTATION_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ACP_INSTALL_HOME="$ACP_IMPLEMENTATION_DIR/home"
export HOME="$ACP_INSTALL_HOME"
export PATH="$ACP_INSTALL_HOME/.local/bin:$PATH"

mkdir -p "$ACP_INSTALL_HOME/.local/bin"
cd "$ACP_IMPLEMENTATION_DIR"

${implementation.source.command}
`;
}

export function resolveImplementationEnvironment({
  implementation,
  env,
  credentialEnv = env,
}: {
  implementation: ACPImplementation;
  env: Readonly<Record<string, string | undefined>>;
  credentialEnv?: Readonly<Record<string, string | undefined>>;
}): Record<string, string> {
  const forwardedEnvironment: Record<string, string> = {};
  for (const name of implementation.forwardEnv ?? []) {
    const value = env[name];
    if (value != null && value.length > 0) {
      forwardedEnvironment[name] = value;
    }
  }
  for (const name of implementation.credentialEnv ?? []) {
    const value = credentialEnv[name];
    if (value != null && value.length > 0) {
      forwardedEnvironment[name] = value;
    }
  }
  return {
    ...forwardedEnvironment,
    ...implementation.env,
  };
}

function validateNpmSimpleSource({
  source,
}: {
  source: ACPNpmSimpleSource;
}): void {
  if (!PACKAGE_NAME_REGEXP.test(source.packageName)) {
    throw new Error(
      `ACP npm package name is invalid: ${JSON.stringify(source.packageName)}.`,
    );
  }
  if (
    source.packageVersion != null &&
    !EXACT_SEMVER_REGEXP.test(source.packageVersion)
  ) {
    throw new Error(
      `ACP npm package version must be an exact semantic version; received ${JSON.stringify(source.packageVersion)}.`,
    );
  }
}

function validateEnvironment({
  env,
}: {
  env: Readonly<Record<string, string>> | undefined;
}): void {
  for (const [key, value] of Object.entries(env ?? {})) {
    if (!ENVIRONMENT_VARIABLE_NAME_REGEXP.test(key)) {
      throw new Error(
        `ACP environment variable name is invalid: ${JSON.stringify(key)}.`,
      );
    }
    if (value.includes('\0')) {
      throw new Error(`ACP runtime environment value for ${key} contains NUL.`);
    }
  }
}

function validateForwardEnvironment({
  forwardEnv,
}: {
  forwardEnv: ReadonlyArray<string> | undefined;
}): void {
  for (const name of forwardEnv ?? []) {
    if (!ENVIRONMENT_VARIABLE_NAME_REGEXP.test(name)) {
      throw new Error(
        `ACP environment variable name is invalid: ${JSON.stringify(name)}.`,
      );
    }
  }
}

function getImplementationEnvironmentKeys({
  implementation,
}: {
  implementation: ACPImplementation;
}): string[] {
  return [
    ...new Set([
      ...(implementation.forwardEnv ?? []),
      ...(implementation.credentialEnv ?? []),
      ...Object.keys(implementation.env ?? {}),
    ]),
  ].sort();
}

function stableStringify({ value }: { value: unknown }): string {
  return JSON.stringify(sortValue({ value }));
}

function sortValue({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sortValue({ value: item }));
  }
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue({ value: item })]),
    );
  }
  return value;
}
