import { createHash } from 'node:crypto';
import type {
  ACPClientApp,
  ACPProviderAuthenticationCompatibility,
} from '../acp-auth';
import type {
  ACPNpmImplementation,
  ACPPermissionModeMapping,
  ACPSimpleNpmImplementation,
} from './acp-v1-settings';

const EXACT_SEMVER_REGEXP =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PACKAGE_NAME_REGEXP =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const EXECUTABLE_NAME_REGEXP = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ENVIRONMENT_VARIABLE_NAME_REGEXP = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateACPV1Implementation(
  implementation: ACPNpmImplementation,
): void {
  if (isLockedImplementation(implementation)) {
    if (implementation.packageJson.length === 0) {
      throw new Error(
        'ACP locked npm implementation packageJson must not be empty.',
      );
    }
    if (implementation.pnpmLockYaml.length === 0) {
      throw new Error(
        'ACP locked npm implementation pnpmLockYaml must not be empty.',
      );
    }
  } else {
    validateSimpleImplementation({ implementation });
  }
  if (!EXECUTABLE_NAME_REGEXP.test(implementation.executable)) {
    throw new Error(
      `ACP executable must be a package bin name without a path; received ${JSON.stringify(implementation.executable)}.`,
    );
  }

  validateForwardEnvironment({ forwardEnv: implementation.forwardEnv });
  validateEnvironment({ env: implementation.env });
  const forwardedKeys = new Set(implementation.forwardEnv ?? []);
  for (const key of Object.keys(implementation.env ?? {})) {
    if (forwardedKeys.has(key)) {
      throw new Error(
        `ACP runtime environment key ${JSON.stringify(key)} cannot be configured in both forwardEnv and env.`,
      );
    }
  }
}

export function createImplementationManifest({
  implementation,
}: {
  implementation: ACPNpmImplementation;
}): string {
  if (isLockedImplementation(implementation)) {
    return implementation.packageJson;
  }
  return (
    JSON.stringify(
      {
        name: 'harness-acp-implementation',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          [implementation.packageName]: implementation.version,
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
  implementation: ACPNpmImplementation;
}): string | undefined {
  return isLockedImplementation(implementation)
    ? implementation.pnpmLockYaml
    : undefined;
}

export function createImplementationDescriptor({
  implementation,
  implementationIdentity,
}: {
  implementation: ACPNpmImplementation;
  implementationIdentity: string;
}): string {
  return (
    JSON.stringify(
      {
        executable: implementation.executable,
        args: implementation.args ?? [],
        envKeys: getImplementationEnvironmentKeys({ implementation }),
        implementationIdentity,
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
  providerAuthentication,
  permissionModeMapping,
}: {
  harnessId: string;
  acpVersion: 'v1';
  implementation: ACPNpmImplementation;
  clientApp: ACPClientApp;
  providerAuthentication: ACPProviderAuthenticationCompatibility | undefined;
  permissionModeMapping?: ACPPermissionModeMapping;
}): string {
  const acquisition = isLockedImplementation(implementation)
    ? {
        mode: 'locked',
        packageJson: implementation.packageJson,
        pnpmLockYaml: implementation.pnpmLockYaml,
      }
    : {
        mode: 'simple',
        packageName: implementation.packageName,
        version: implementation.version,
      };
  const forwardedEnvironment = [
    ...new Set(implementation.forwardEnv ?? []),
  ].sort();
  const literalEnvironment = Object.fromEntries(
    Object.entries(implementation.env ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, { value }]),
  );
  const payload = {
    harnessId,
    acpVersion,
    acquisition,
    executable: implementation.executable,
    args: implementation.args ?? [],
    clientApp,
    environment: {
      forwarded: forwardedEnvironment,
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
  implementation: ACPNpmImplementation;
}): string {
  return (
    `pnpm --dir ${implementationDir} install` +
    (isLockedImplementation(implementation) ? ' --frozen-lockfile' : '') +
    ` --prod --store-dir ${storeDir}`
  );
}

export function resolveImplementationEnvironment({
  implementation,
  env,
}: {
  implementation: ACPNpmImplementation;
  env: Readonly<Record<string, string | undefined>>;
}): Record<string, string> {
  const forwardedEnvironment: Record<string, string> = {};
  for (const name of implementation.forwardEnv ?? []) {
    const value = env[name];
    if (value != null && value.length > 0) {
      forwardedEnvironment[name] = value;
    }
  }
  return {
    ...forwardedEnvironment,
    ...implementation.env,
  };
}

function validateSimpleImplementation({
  implementation,
}: {
  implementation: ACPSimpleNpmImplementation;
}): void {
  if (!PACKAGE_NAME_REGEXP.test(implementation.packageName)) {
    throw new Error(
      `ACP npm package name is invalid: ${JSON.stringify(implementation.packageName)}.`,
    );
  }
  if (!EXACT_SEMVER_REGEXP.test(implementation.version)) {
    throw new Error(
      `ACP npm implementation version must be an exact semantic version; received ${JSON.stringify(implementation.version)}.`,
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
  implementation: ACPNpmImplementation;
}): string[] {
  return [
    ...new Set([
      ...(implementation.forwardEnv ?? []),
      ...Object.keys(implementation.env ?? {}),
    ]),
  ].sort();
}

function isLockedImplementation(
  implementation: ACPNpmImplementation,
): implementation is Extract<ACPNpmImplementation, { mode: 'locked' }> {
  return implementation.mode === 'locked';
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
