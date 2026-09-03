import type {
  HarnessV1Authentication,
  HarnessV1CredentialForwarding,
  HarnessV1PermissionMode,
  HarnessV1RequestTransformation,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import type { ToolResultPart } from '@ai-sdk/provider-utils';
import type { ACPToolCall } from '../acp-tool-call';

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
  /** Optional pnpm workspace configuration required by the locked install. */
  readonly pnpmWorkspaceYaml?: string;
};

export type ACPInstallCommandSource = {
  readonly type: 'install-command';
  readonly command: string;
};

export type ACPSource =
  | ACPNpmSimpleSource
  | ACPNpmLockedSource
  | ACPInstallCommandSource;

export type ACPAuthentication = {
  readonly methodId: string;
  readonly meta?: Readonly<Record<string, ACPSerializableValue>>;
  readonly clientCapabilities?: Readonly<Record<string, ACPSerializableValue>>;
};

export type ACPAuthenticationMode = HarnessV1Authentication;

export type ACPProviderAuthentication = {
  readonly gateway: {
    readonly env: Readonly<Record<string, ACPProfileValue>>;
  };
};

export type ACPModelMapping =
  | {
      readonly type: 'session-config-option';
      readonly path: string;
    }
  | {
      readonly type: 'session-model';
      readonly path: string;
    };

export type ACPCredentialBrokering = ({
  env,
  sandboxEnv,
  headers,
}: {
  env: Readonly<Record<string, string>>;
  sandboxEnv?: Readonly<Record<string, string>>;
  headers?: Readonly<Record<string, string>>;
}) => ReadonlyArray<HarnessV1RequestTransformation>;

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

/**
 * Describes where an ACP implementation accepts native session instructions.
 * Session metadata paths are relative to `_meta`; launch environment paths are
 * relative to the parsed JSON object stored in `variable`.
 */
export type ACPInstructionMapping =
  | {
      readonly type: 'session-meta';
      readonly path: ReadonlyArray<string>;
    }
  | {
      readonly type: 'launch-env-json';
      readonly variable: string;
      readonly path: ReadonlyArray<string>;
    };

export type ACPOutputSchemaMapping = {
  readonly type: 'session-prompt-meta';
  readonly path: ReadonlyArray<string>;
};

export type ACPAskUserQuestionsSettings = {
  readonly requestMethod: string;
  readonly isNativeToolCall?: (options: {
    nativeToolCall: ACPToolCall;
  }) => boolean;
  readonly fromNativeRequest: (options: {
    nativeRequest: unknown;
    nativeToolCall?: ACPToolCall;
  }) => Extract<HarnessV1StreamPart, { type: 'tool-call' }> | null;
  readonly toNativeResponse: (options: {
    nativeRequest: unknown;
    toolResult: ToolResultPart;
  }) => unknown;
  readonly matchesNativeRequest?: (options: {
    previousNativeRequest: unknown;
    nativeRequest: unknown;
  }) => boolean;
};

export type ACPV1Settings = {
  readonly version?: 'v1';
  readonly harnessId: string;
  readonly mcpServers?: Record<string, unknown>;
  readonly isMcpToolCall?: (toolCall: ACPToolCall) => boolean;
  readonly auth?: ACPAuthenticationMode;
  readonly source: ACPSource;
  readonly executable: string;
  readonly args?: ReadonlyArray<string>;
  readonly forwardEnv?: ReadonlyArray<string>;
  readonly credentialEnv?: ReadonlyArray<string>;
  readonly credentialBrokering?: ACPCredentialBrokering;
  /**
   * Customizes each credential value before it is forwarded into a sandbox
   * process. This does not restrict which credentials the harness adapter can
   * discover, read, or otherwise access in the host process.
   */
  readonly credentialForwarding?: HarnessV1CredentialForwarding;
  /**
   * Runtime environment values that are safe to persist in bootstrap and
   * lifecycle compatibility identity.
   */
  readonly env?: Readonly<Record<string, string>>;
  readonly authentication?: ACPAuthentication;
  readonly clientCapabilities?: Readonly<Record<string, ACPSerializableValue>>;
  readonly providerAuthentication?: ACPProviderAuthentication;
  /**
   * Maps the HarnessAgent model identifier to an ACP session operation.
   */
  readonly modelMapping: ACPModelMapping;
  /**
   * @deprecated Use `model` on `HarnessAgent` instead.
   */
  readonly modelId?: string;
  /**
   * Native skills directory relative to the ACP implementation's home
   * directory. Defaults to `.agents/skills`.
   */
  readonly skillsDirectory?: string;
  /**
   * Routes HarnessAgent instructions to a runtime-native system or developer
   * prompt. Changed instructions are prepended to the next user prompt when
   * ACP does not expose a native per-turn instruction update.
   */
  readonly instructionMapping?: ACPInstructionMapping;
  /**
   * Maps structured output JSON Schema to an implementation-specific path
   * below the ACP session prompt's `_meta` field.
   */
  readonly outputSchemaMapping?: ACPOutputSchemaMapping;
  readonly askUserQuestions?: ACPAskUserQuestionsSettings;
  readonly permissionModeMapping?: ACPPermissionModeMapping;
  readonly session?: {
    readonly meta?: Readonly<Record<string, ACPSerializableValue>>;
  };
  /**
   * Creates the authentication token used by the sandbox bridge. Defaults to
   * a random 32-byte hexadecimal token.
   */
  readonly mintBridgeToken?: (sandboxId: string) => string;
};
