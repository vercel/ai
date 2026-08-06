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

type ACPNpmLaunchSettings = {
  readonly type: 'npm';
  readonly executable: string;
  readonly args?: ReadonlyArray<string>;
  readonly forwardEnv?: ReadonlyArray<string>;
  /**
   * Runtime environment values that are safe to persist in bootstrap and
   * lifecycle compatibility identity.
   */
  readonly env?: Readonly<Record<string, string>>;
};

export type ACPSimpleNpmImplementation = ACPNpmLaunchSettings & {
  readonly mode: 'simple';
  readonly packageName: string;
  readonly version: string;
};

export type ACPLockedNpmImplementation = ACPNpmLaunchSettings & {
  readonly mode: 'locked';
  readonly packageJson: string;
  readonly pnpmLockYaml: string;
};

export type ACPNpmImplementation =
  | ACPSimpleNpmImplementation
  | ACPLockedNpmImplementation;

export type ACPAuthentication = {
  readonly methodId: string;
  readonly meta?: Readonly<Record<string, ACPSerializableValue>>;
  readonly clientCapabilities?: Readonly<Record<string, ACPSerializableValue>>;
};

export type ACPGatewayAuthMethodRoute = {
  readonly type: 'auth-method';
  readonly methodId: string;
  readonly env?: Readonly<Record<string, ACPProfileValue>>;
  readonly clientCapabilities?: Readonly<Record<string, ACPProfileValue>>;
  readonly meta?: Readonly<Record<string, ACPProfileValue>>;
};

export type ACPGatewayProviderMethodRoute = {
  readonly type: 'provider-method';
  readonly method: string;
  readonly advertisedCapability: ReadonlyArray<string>;
  readonly env?: Readonly<Record<string, ACPProfileValue>>;
  readonly clientCapabilities?: Readonly<Record<string, ACPProfileValue>>;
  readonly params: Readonly<Record<string, ACPProfileValue>>;
};

export type ACPGatewayLaunchRoute = {
  readonly type: 'launch';
  readonly env: Readonly<Record<string, ACPProfileValue>>;
};

export type ACPGatewaySessionRoute = {
  readonly type: 'session';
  readonly env?: Readonly<Record<string, ACPProfileValue>>;
  readonly meta: Readonly<Record<string, ACPProfileValue>>;
};

export type ACPGatewayRoute =
  | ACPGatewayAuthMethodRoute
  | ACPGatewayProviderMethodRoute
  | ACPGatewayLaunchRoute
  | ACPGatewaySessionRoute;

export type ACPProviderAuthenticationMode = 'auto' | 'direct' | 'ai-gateway';

export type ACPProviderAuthentication = {
  readonly gateway: {
    readonly route: ACPGatewayRoute;
    readonly baseUrl?: string;
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
  Record<HarnessV1PermissionMode, ACPPermissionModeTarget>
>;

export type ACPV1Settings = {
  readonly version?: 'v1';
  readonly harnessId: string;
  readonly auth?: ACPProviderAuthenticationMode;
  readonly implementation: ACPNpmImplementation;
  readonly authentication?: ACPAuthentication;
  readonly providerAuthentication?: ACPProviderAuthentication;
  readonly modelId?: string;
  readonly permissionModeMapping?: ACPPermissionModeMapping;
  readonly session?: {
    readonly meta?: Readonly<Record<string, ACPSerializableValue>>;
  };
};
