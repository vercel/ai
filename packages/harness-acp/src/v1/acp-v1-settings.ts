import type { HarnessV1PermissionMode } from '@ai-sdk/harness';

export type ACPSerializablePrimitive = string | number | boolean | null;

export type ACPSerializableValue =
  | ACPSerializablePrimitive
  | ReadonlyArray<ACPSerializableValue>
  | { readonly [key: string]: ACPSerializableValue };

export type ACPValueSource = {
  readonly $source:
    | 'gateway-api-key'
    | 'gateway-base-url'
    | 'gateway-authorization'
    | 'client-app'
    | 'client-app-name'
    | 'client-app-version';
  readonly prefix?: string;
  readonly suffix?: string;
  readonly ensureSuffix?: string;
};

export type ACPProfileValue =
  | ACPSerializablePrimitive
  | ACPValueSource
  | ReadonlyArray<ACPProfileValue>
  | { readonly [key: string]: ACPProfileValue };

export type ACPNpmSimpleSource = {
  readonly type: 'npm-simple';
  readonly packageName: string;
  /**
   * Exact version to install. When omitted, the package's `latest` dist-tag is
   * installed and no version takes part in the implementation identity, so a
   * new upstream release does not invalidate existing lifecycle state.
   */
  readonly packageVersion?: string;
};

export type ACPNpmLockedSource = {
  readonly type: 'npm-locked';
  readonly packageJson: string;
  readonly pnpmLockYaml: string;
};

export type ACPSource = ACPNpmSimpleSource | ACPNpmLockedSource;

export type ACPAuthentication = {
  readonly methodId: string;
  readonly meta?: Readonly<Record<string, ACPSerializableValue>>;
  readonly clientCapabilities?: Readonly<Record<string, ACPSerializableValue>>;
};

export type ACPProviderAuthenticationMode = 'auto' | 'direct' | 'ai-gateway';

export type ACPProviderAuthentication = {
  readonly gateway: {
    readonly env: Readonly<Record<string, ACPProfileValue>>;
  };
};

export type ACPPermissionModeTarget =
  | {
      readonly type: 'session-mode';
      readonly modeId: string;
    }
  | {
      readonly type: 'session-config-option';
      readonly configId: string;
      readonly value: string | boolean;
    };

export type ACPPermissionModeMapping = Readonly<
  Record<HarnessV1PermissionMode, ACPPermissionModeTarget | null>
>;

export type ACPV1Settings = {
  readonly version?: 'v1';
  readonly harnessId: string;
  readonly auth?: ACPProviderAuthenticationMode;
  readonly source: ACPSource;
  readonly executable: string;
  readonly args?: ReadonlyArray<string>;
  readonly forwardEnv?: ReadonlyArray<string>;
  /**
   * Runtime environment values that are safe to persist in bootstrap and
   * lifecycle compatibility identity.
   */
  readonly env?: Readonly<Record<string, string>>;
  readonly authentication?: ACPAuthentication;
  readonly providerAuthentication?: ACPProviderAuthentication;
  readonly modelId?: string;
  readonly permissionModeMapping?: ACPPermissionModeMapping;
  readonly session?: {
    readonly meta?: Readonly<Record<string, ACPSerializableValue>>;
  };
};
