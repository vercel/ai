import type {
  HarnessV1Authentication,
  HarnessV1CredentialForwarding,
  HarnessV1MintBridgeTokenCallback,
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

/**
 * Locked NPM installation of the ACP agent. The manifest is the complete
 * bridge installation, so in addition to the agent package it must declare
 * every dependency of the `@ai-sdk/harness-acp` bridge manifest at the same
 * version.
 */
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

export type ACPSource = ACPNpmLockedSource | ACPInstallCommandSource;

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

export type ACPAuthenticationFile = {
  /** Path relative to the ACP agent's home directory. */
  readonly path: string;
  readonly content: string;
};

export type ACPAuthenticationFiles = (options: {
  /** Host values resolved for the agent. */
  readonly env: Readonly<Record<string, string>>;
  /** Values exposed to the sandbox process after credential brokering. */
  readonly sandboxEnv: Readonly<Record<string, string>>;
  readonly credentialBrokeringAvailable: boolean;
}) => ReadonlyArray<ACPAuthenticationFile>;

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
 * Describes where an ACP agent accepts native session instructions.
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
    }
  | {
      readonly type: 'filesystem';
      readonly path: string;
    };

export type ACPOutputSchemaMapping = {
  readonly type: 'session-prompt-meta';
  readonly path: ReadonlyArray<string>;
};

/**
 * Transport used for the harness-owned MCP server that exposes host tools to
 * an ACP agent.
 */
export type ACPHostToolMCPTransport = 'stdio' | 'http';

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
  /**
   * Resolves adapter-owned authentication on the host before any environment
   * values are forwarded to the ACP agent.
   */
  readonly resolveAuthenticationEnvironment?: (options: {
    readonly auth: ACPAuthenticationMode | undefined;
    readonly env: Readonly<Record<string, string | undefined>>;
  }) => Promise<Readonly<Record<string, string | undefined>>>;
  readonly source: ACPSource;
  readonly executable: string;
  readonly args?: ReadonlyArray<string>;
  readonly forwardEnv?: ReadonlyArray<string>;
  readonly credentialEnv?: ReadonlyArray<string>;
  readonly credentialBrokering?: ACPCredentialBrokering;
  /**
   * Materializes private authentication files below the ACP agent's
   * home directory before the agent starts.
   */
  readonly authenticationFiles?: ACPAuthenticationFiles;
  /**
   * Customizes each credential value before it is forwarded into a sandbox
   * process. This does not restrict which credentials the harness adapter can
   * discover, read, or otherwise access in the host process.
   */
  readonly credentialForwarding?: HarnessV1CredentialForwarding;
  /**
   * Runtime environment values that are safe to persist in lifecycle
   * compatibility identity.
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
   * Native skills directory relative to the ACP agent's home
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
   * Maps structured output JSON Schema to an agent-specific path
   * below the ACP session prompt's `_meta` field.
   */
  readonly outputSchemaMapping?: ACPOutputSchemaMapping;
  /**
   * Transport used for the harness-owned MCP server that exposes host tools to
   * the ACP agent. Defaults to `stdio`. Set this to `http` for
   * agents that only accept HTTP or SSE MCP servers from the client,
   * which requires the agent to advertise
   * `agentCapabilities.mcpCapabilities.http`.
   */
  readonly hostToolMcpTransport?: ACPHostToolMCPTransport;
  /**
   * Non-text tool model output the ACP agent can deliver to its
   * model. Currently accepts images; undeclared image output is omitted with a
   * warning. Also enables image prompts when the ACP agent does not advertise
   * image prompt support. Defaults to an empty list.
   */
  readonly nonTextContentTypes?: ReadonlyArray<'image'>;
  readonly askUserQuestions?: ACPAskUserQuestionsSettings;
  readonly permissionModeMapping?: ACPPermissionModeMapping;
  readonly session?: {
    readonly meta?: Readonly<Record<string, ACPSerializableValue>>;
  };
  /**
   * Creates the authentication token used by the sandbox bridge. Defaults to
   * a random 32-byte hexadecimal token.
   */
  readonly mintBridgeToken?: HarnessV1MintBridgeTokenCallback;
};

const HARNESS_ID_REGEXP = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXECUTABLE_NAME_REGEXP = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ENVIRONMENT_VARIABLE_NAME_REGEXP = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateACPV1Settings({
  settings,
}: {
  settings: ACPV1Settings;
}): void {
  if (
    (settings.credentialEnv == null) !==
    (settings.credentialBrokering == null)
  ) {
    throw new Error(
      'ACP credentialEnv and credentialBrokering must be configured together.',
    );
  }
  if (
    settings.mcpServers != null &&
    Object.prototype.hasOwnProperty.call(
      settings.mcpServers,
      'ai-sdk-harness-tools',
    )
  ) {
    throw new Error(
      'ACP MCP server name "ai-sdk-harness-tools" is reserved for HarnessAgent tools.',
    );
  }
  if (!HARNESS_ID_REGEXP.test(settings.harnessId)) {
    throw new Error(
      `ACP harnessId must be a stable kebab-case identifier; received ${JSON.stringify(settings.harnessId)}.`,
    );
  }

  const { source } = settings;
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
  } else if (source.command.trim().length === 0) {
    throw new Error('ACP source.command must not be empty.');
  }
  if (!EXECUTABLE_NAME_REGEXP.test(settings.executable)) {
    throw new Error(
      `ACP executable must be a bare command name without a path; received ${JSON.stringify(settings.executable)}.`,
    );
  }

  const forwardedKeys = new Set(settings.forwardEnv);
  const credentialKeys = new Set(settings.credentialEnv);
  for (const name of [...forwardedKeys, ...credentialKeys]) {
    validateEnvironmentVariableName({ name });
  }
  for (const key of credentialKeys) {
    if (forwardedKeys.has(key)) {
      throw new Error(
        `ACP runtime environment key ${JSON.stringify(key)} cannot be configured in both forwardEnv and credentialEnv.`,
      );
    }
  }
  for (const [key, value] of Object.entries(settings.env ?? {})) {
    validateEnvironmentVariableName({ name: key });
    if (value.includes('\0')) {
      throw new Error(`ACP runtime environment value for ${key} contains NUL.`);
    }
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

export function resolveACPAgentEnvironment({
  settings,
  env,
  credentialEnv,
}: {
  settings: Pick<ACPV1Settings, 'forwardEnv' | 'credentialEnv' | 'env'>;
  env: Readonly<Record<string, string | undefined>>;
  credentialEnv: Readonly<Record<string, string | undefined>>;
}): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of settings.forwardEnv ?? []) {
    const value = env[name];
    if (value != null && value.length > 0) environment[name] = value;
  }
  for (const name of settings.credentialEnv ?? []) {
    const value = credentialEnv[name];
    if (value != null && value.length > 0) environment[name] = value;
  }
  return { ...environment, ...settings.env };
}

function validateEnvironmentVariableName({ name }: { name: string }): void {
  if (!ENVIRONMENT_VARIABLE_NAME_REGEXP.test(name)) {
    throw new Error(
      `ACP environment variable name is invalid: ${JSON.stringify(name)}.`,
    );
  }
}
