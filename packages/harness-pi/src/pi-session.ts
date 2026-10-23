import {
  createAgentSession,
  CURRENT_SESSION_VERSION,
  createMcpExtension,
  createReadToolDefinition,
  createSyntheticSourceInfo,
  createToolSearchExtension,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentToolResult,
  type ExtensionAPI,
  type ExtensionFactory,
  type McpExposure,
  type McpServerConfig,
  type ProviderConfig,
  type Skill,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { devNull, tmpdir } from 'node:os';
import path from 'node:path';
import { Type } from 'typebox';
import {
  HarnessCapabilityUnsupportedError,
  HarnessError,
  type HarnessV1BuiltinToolFiltering,
  type HarnessV1ContinueTurnOptions,
  type HarnessV1ContinueTurnState,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1LifecycleState,
  type HarnessV1PermissionMode,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
  type HarnessV1Skill,
  type HarnessV1StreamPart,
  type HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import {
  getRestrictedSandboxSession,
  convertHarnessToolModelOutput,
  resolveSandboxHomeDir,
  writeSkills,
} from '@ai-sdk/harness/utils';
import {
  secureJsonParse,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import {
  createPiModelRuntime,
  registerPiProviders,
  resolvePiEnv,
  type PiAuthenticationMode,
  type PiCredentialStore,
} from './pi-auth';
import { resolvePiSubscriptionAgentDir } from './pi-subscription';
import { parseNativeEvent, type PiSessionEvent } from './pi-events';
import { createPiModelResolver } from './pi-model-resolver';
import { createPiPathMapper, type PiFileToolPathPolicy } from './pi-paths';
import {
  createPiRemoteOps,
  resolvePiSandboxPathOrParent,
  type PiRemoteOps,
} from './pi-remote-ops';
import { executePiSandboxRead } from './pi-read-operations';
import { expandPiSkillCommand } from './pi-skill-command';
import {
  truncatePiToolModelOutput,
  truncatePiToolOutputHead,
  truncatePiToolOutputTail,
} from './pi-tool-result';
import {
  piAssistantMessageSchema,
  sessionEntriesOf,
  withSessionId,
  type PiAssistantMessage,
  type PiCompletedToolResult,
  type PiLifecycleData,
  type PiPendingToolBatch,
  type PiSessionEntries,
} from './pi-lifecycle-state';
import {
  appendSessionEntries,
  readSessionEntries,
  type PiSessionStorage,
} from './pi-session-storage';
import { runToolBatchReplay, takeToolBatchForReplay } from './pi-tool-batch';
import {
  createPiTranslatorState,
  takePiEarlyFinishStep,
  toHarnessUsage,
  translatePiEvent,
  type PiTranslatorState,
} from './pi-translate';
import { toolSpecToTypeBoxParameters } from './pi-typebox-adapter';
import {
  extractPiPromptContent,
  safePiMetadataSegment,
  serializeToolOutput,
  type PiPromptContent,
} from './pi-utils';

const HARNESS_ID = 'pi';

const PI_SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/*
 * Pi runs in this Node process, not behind an attachable in-sandbox bridge.
 * During a tool approval pause the Pi turn is still alive and blocked on the
 * custom tool promise, so in-process reattachment parks that live session for
 * the next same-process resume instead of stopping it and resolving the
 * promise as an error. Cross-process resume still falls back to the session
 * entries in the lifecycle state.
 */
const parkedPiSessions = new Map<
  string,
  {
    session: HarnessV1Session;
    input: CreatePiSessionInput;
    stateType: 'continue-turn' | 'resume-session';
  }
>();

function createHarnessPiSkills({
  skills,
  sandboxSkillRootDir,
}: {
  skills: ReadonlyArray<HarnessV1Skill>;
  sandboxSkillRootDir: string;
}): Skill[] {
  return createConfiguredPiSkills(
    skills.map(skill => ({
      name: skill.name,
      description: skill.description,
      filePath: path.posix.join(
        sandboxSkillRootDir,
        safePiMetadataSegment(skill.name, 'skill'),
        'SKILL.md',
      ),
    })),
  );
}

const PI_NATIVE_BUILTIN_NAMES = [
  'read',
  'write',
  'edit',
  'bash',
  'grep',
  'find',
  'ls',
] as const;

const NATIVE_TO_COMMON: Readonly<Record<string, string>> = {
  find: 'glob',
};

const PUBLIC_TO_NATIVE: Readonly<
  Record<string, (typeof PI_NATIVE_BUILTIN_NAMES)[number]>
> = {
  read: 'read',
  write: 'write',
  edit: 'edit',
  bash: 'bash',
  grep: 'grep',
  glob: 'find',
  ls: 'ls',
};

const PI_NATIVE_TOOL_KINDS: Readonly<
  Record<(typeof PI_NATIVE_BUILTIN_NAMES)[number], 'readonly' | 'edit' | 'bash'>
> = {
  read: 'readonly',
  write: 'edit',
  edit: 'edit',
  bash: 'bash',
  grep: 'readonly',
  find: 'readonly',
  ls: 'readonly',
};

function resolveActivePiBuiltinNames(
  toolFiltering: HarnessV1BuiltinToolFiltering | undefined,
): ReadonlyArray<(typeof PI_NATIVE_BUILTIN_NAMES)[number]> {
  if (toolFiltering == null) return PI_NATIVE_BUILTIN_NAMES;
  if (toolFiltering.mode === 'allow') {
    return toolFiltering.toolNames
      .map(name => PUBLIC_TO_NATIVE[name])
      .filter(
        (name): name is (typeof PI_NATIVE_BUILTIN_NAMES)[number] =>
          name != null,
      );
  }
  return PI_NATIVE_BUILTIN_NAMES.filter(
    native =>
      !toolFiltering.toolNames.includes(NATIVE_TO_COMMON[native] ?? native),
  );
}

export type PiThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

/**
 * MCP exposure modes the harness serves. Pi's `codemode` exposure needs Pi's
 * codemode extension, which the harness does not load.
 */
export type PiMcpExposure = Exclude<McpExposure, 'codemode'>;

/**
 * Pi's native MCP server configuration (stdio or streamable HTTP), limited to
 * the exposure modes the harness serves.
 */
export type PiMcpServerConfig = McpServerConfig extends infer Config
  ? Config extends McpServerConfig
    ? Omit<Config, 'exposure' | 'toolExposure'> & {
        /**
         * How the server's tools reach the model.
         *
         * @default 'direct'
         */
        readonly exposure?: PiMcpExposure;
        /**
         * Exposure of single tools, keyed by the tool name the server offers or
         * a `*` pattern, overriding `exposure`.
         */
        readonly toolExposure?: Readonly<Record<string, PiMcpExposure>>;
      }
    : never
  : never;

/**
 * @deprecated Pi's native MCP serves `mcpServers` and has no adapter settings.
 * It always names tools `mcp__<server>__<tool>` and always truncates results
 * over 20 KB, writing the full text to a file in the host temp directory.
 * Values it cannot honor fail session start.
 */
export interface PiMcpSettings {
  /**
   * @deprecated Native MCP always names tools `mcp__<server>__<tool>`, so only
   * `'mcp'` is accepted; any other value fails session start.
   */
  readonly toolPrefix?: 'server' | 'none' | 'short' | 'mcp';
  /**
   * @deprecated Native MCP always truncates results over 20 KB and writes the
   * full text to a file in the host temp directory, so `false` fails session
   * start.
   */
  readonly outputGuard?: boolean;
}

export type PiCacheRetention = 'none' | 'short' | 'long';

/**
 * The harness session a Pi extension factory runs in.
 */
export interface PiHarnessExtensionSession {
  /**
   * The session's sandbox, restricted to the operations harness tools may use.
   */
  readonly sandboxSession: SandboxSession;
  /**
   * The sandbox directory the session works in.
   */
  readonly sessionWorkDir: string;
  /**
   * The instructions of the session's current turn. Instructions arrive with
   * each turn, so read them when a turn runs, not when the factory runs.
   */
  readonly instructions: () => string | undefined;
}

/**
 * A Pi extension factory that also receives the harness session it runs in.
 * Plain Pi `ExtensionFactory` functions are accepted unchanged.
 */
export type PiHarnessExtensionFactory = (
  pi: ExtensionAPI,
  session: PiHarnessExtensionSession,
) => ReturnType<ExtensionFactory>;

/**
 * A skill listed to the model. Its file must already exist in the sandbox at
 * `filePath`, because the model reads it with the `read` tool.
 */
export interface PiSandboxSkill {
  readonly name: string;
  readonly description: string;
  /**
   * Absolute sandbox path of the skill's `SKILL.md`.
   */
  readonly filePath: string;
}

/**
 * Project resources Pi reads instead of discovering them on a filesystem.
 */
export interface PiResources {
  readonly skills?: ReadonlyArray<PiSandboxSkill>;
}

function createConfiguredPiSkills(
  skills: ReadonlyArray<PiSandboxSkill>,
): Skill[] {
  return skills.map(skill => {
    const baseDir = path.posix.dirname(skill.filePath);
    return {
      name: skill.name,
      description: skill.description,
      filePath: skill.filePath,
      baseDir,
      sourceInfo: createSyntheticSourceInfo(skill.filePath, {
        source: 'harness',
        baseDir,
      }),
      disableModelInvocation: false,
    };
  });
}

export interface PiSessionSettings {
  readonly auth?: PiAuthenticationMode;
  readonly credentials?: PiCredentialStore;
  readonly reattachInProcess?: boolean;
  readonly headers?: Readonly<Record<string, string>>;
  readonly thinkingLevel?: PiThinkingLevel;
  readonly cacheRetention?: PiCacheRetention;
  readonly mcpServers?: Readonly<Record<string, PiMcpServerConfig>>;
  readonly mcpSettings?: PiMcpSettings;
  readonly providers?: Readonly<Record<string, ProviderConfig>>;
  readonly extensionFactories?: ReadonlyArray<PiHarnessExtensionFactory>;
  readonly fileToolPathPolicy?: PiFileToolPathPolicy;
  readonly resources?: PiResources;
  readonly sessionStorage?: PiSessionStorage;
}

export interface CreatePiSessionInput {
  readonly sessionId: string;
  readonly sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  readonly sessionWorkDir: string;
  readonly settings: PiSessionSettings;
  readonly clientApp: string;
  readonly isResume: boolean;
  readonly resumeStateType?:
    | HarnessV1ContinueTurnState['type']
    | HarnessV1ResumeSessionState['type'];
  readonly permissionMode?: HarnessV1PermissionMode;
  readonly builtinToolFiltering?: HarnessV1BuiltinToolFiltering;
  readonly resumeEntries?: PiSessionEntries;
  readonly resumeLeafId?: string;
  /**
   * Tool batch that was waiting on host input when the resumed state was
   * persisted. The first continuation replays it once its host input arrives.
   */
  readonly resumePendingToolBatch?: PiPendingToolBatch;
  readonly abortSignal?: AbortSignal;
  /**
   * Directory holding Pi's global agent config (auth.json, models.json,
   * settings.json). Native auth from this directory is considered after
   * applicable environment credentials. Model and general settings are only
   * reused when this option is explicit.
   */
  readonly agentDir?: string;
}

function hasCompatibleReattachSettings(
  parked: CreatePiSessionInput,
  current: CreatePiSessionInput,
): boolean {
  return (
    parked.sandboxSession === current.sandboxSession &&
    parked.sessionWorkDir === current.sessionWorkDir &&
    parked.clientApp === current.clientApp &&
    parked.permissionMode === current.permissionMode &&
    parked.builtinToolFiltering === current.builtinToolFiltering &&
    parked.abortSignal === current.abortSignal &&
    parked.agentDir === current.agentDir &&
    parked.settings.auth === current.settings.auth &&
    parked.settings.credentials === current.settings.credentials &&
    parked.settings.headers === current.settings.headers &&
    parked.settings.thinkingLevel === current.settings.thinkingLevel &&
    parked.settings.cacheRetention === current.settings.cacheRetention &&
    parked.settings.mcpServers === current.settings.mcpServers &&
    parked.settings.mcpSettings === current.settings.mcpSettings &&
    parked.settings.providers === current.settings.providers &&
    parked.settings.extensionFactories ===
      current.settings.extensionFactories &&
    parked.settings.fileToolPathPolicy ===
      current.settings.fileToolPathPolicy &&
    parked.settings.resources === current.settings.resources &&
    parked.settings.sessionStorage === current.settings.sessionStorage
  );
}

type HostToolSubmission = Parameters<
  HarnessV1PromptControl['submitToolResult']
>[0];

interface PiSandboxPaths {
  readonly homeDir: string;
  readonly skillRootDir: string;
  readonly remoteOps: PiRemoteOps;
}

interface PendingToolResult {
  resolve: (value: HostToolSubmission) => void;
}

interface PendingToolApproval {
  resolve: (value: { approved: boolean; reason?: string }) => void;
}

interface ActivePiTurn {
  readonly token: object;
  readonly done: Promise<void>;
  readonly abort: (reason?: unknown) => Promise<void>;
}

/**
 * Holds a cross-process continuation until the framework has delivered the
 * host input (tool results, built-in approval decisions) for every call of
 * the persisted tool batch, then replays the batch.
 */
interface ToolBatchReplayBarrier {
  readonly awaiting: Set<string>;
  readonly deliveredHostResults: Map<string, HostToolSubmission>;
  readonly toCheckpoint: () => PiPendingToolBatch;
  readonly start: () => void;
  /** Settle the barrier without replaying: resolves `done` cleanly when no
   * reason is given, rejects it otherwise. No-op once the replay started. */
  readonly cancel: (reason?: unknown) => void;
}

interface PiToolBatchReplay {
  readonly assistantMessage: PiAssistantMessage;
  readonly toolResults: Map<string, PiCompletedToolResult>;
  readonly suppressedToolCallIds: Set<string>;
  readonly hostToolResults: Map<string, HostToolSubmission>;
}

export async function createPiSession(
  input: CreatePiSessionInput,
): Promise<HarnessV1Session> {
  if (input.isResume) {
    const parked = parkedPiSessions.get(input.sessionId);
    if (parked) {
      parkedPiSessions.delete(input.sessionId);
      if (
        input.settings.reattachInProcess !== false &&
        (input.resumeStateType == null ||
          input.resumeStateType === parked.stateType) &&
        hasCompatibleReattachSettings(parked.input, input)
      ) {
        return {
          ...parked.session,
          isResume: true,
        };
      }

      // The caller explicitly requested cold restoration, supplied settings
      // that cannot safely reuse the live runtime, or supplied a resume-session
      // state that represents progress beyond the parked continue-turn. Retire
      // the stale live session before rebuilding from the persisted journal
      // with this request's runtime settings.
      await parked.session.doDestroy();
    }
  }

  assertPiMcpSettingsSupported(input.settings.mcpSettings);
  const mcpServers = resolvePiMcpServers(input.settings.mcpServers);

  const safeSessionId = input.sessionId.replace(/[\\/: ]/g, '-');
  const hostRoot = path.join(tmpdir(), 'ai-sdk-harness', 'pi', safeSessionId);
  const hostAgentDir = path.join(hostRoot, 'agent');
  const toolSafeSandboxSession = getRestrictedSandboxSession(
    input.sandboxSession,
  );
  const fileToolPathPolicy = input.settings.fileToolPathPolicy;

  const sessionWorkDir = input.sessionWorkDir;
  await mkdir(hostAgentDir, { recursive: true });

  const permissionMode = input.permissionMode ?? 'allow-all';
  const activeBuiltinNames = resolveActivePiBuiltinNames(
    input.builtinToolFiltering,
  );
  const activeNativeToCommon = Object.fromEntries(
    Object.entries(NATIVE_TO_COMMON).filter(([native]) =>
      activeBuiltinNames.some(name => name === native),
    ),
  );
  let harnessSkills: Skill[] = [];
  const resources = input.settings.resources ?? {};
  const configuredSkills = createConfiguredPiSkills(resources.skills ?? []);

  let sandboxPaths: Promise<PiSandboxPaths> | undefined;
  const resolveSandboxPaths = (): Promise<PiSandboxPaths> => {
    sandboxPaths ??= (async () => {
      const [canonicalDeniedRoots, homeDir] = await Promise.all([
        Promise.all(
          (fileToolPathPolicy?.deniedRoots ?? []).map(deniedRoot =>
            resolvePiSandboxPathOrParent({
              sandbox: toolSafeSandboxSession,
              remotePath: path.posix.normalize(deniedRoot),
              inputPath: deniedRoot,
            }),
          ),
        ),
        resolveSandboxHomeDir({
          sandbox: toolSafeSandboxSession,
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        }),
      ]);
      const skillRootDir = path.posix.join(homeDir, '.agents', 'skills');
      const paths = createPiPathMapper({
        sandboxWorkDir: sessionWorkDir,
        readableRoots: [
          { sandboxDir: skillRootDir },
          ...configuredSkills.map(skill => ({ sandboxDir: skill.baseDir })),
          ...(fileToolPathPolicy?.readableRoots ?? []).map(sandboxDir => ({
            sandboxDir,
          })),
        ],
        writableRoots: fileToolPathPolicy?.writableRoots,
        deniedRoots: fileToolPathPolicy?.deniedRoots
          ? [
              ...new Set([
                ...fileToolPathPolicy.deniedRoots,
                ...canonicalDeniedRoots,
              ]),
            ]
          : undefined,
        ...(fileToolPathPolicy ? { homeDir } : {}),
      });
      const remoteOps = createPiRemoteOps({
        sandbox: toolSafeSandboxSession,
        paths,
        onFileChange: (event, relPath) => {
          currentEmit?.({ type: 'file-change', event, path: relPath });
        },
      });
      return { homeDir, skillRootDir, remoteOps };
    })().catch(error => {
      sandboxPaths = undefined;
      throw error;
    });
    return sandboxPaths;
  };
  const piSessionId = PI_SESSION_ID_PATTERN.test(input.sessionId)
    ? input.sessionId
    : undefined;
  const storage = input.settings.sessionStorage;
  let seededEntries =
    input.resumeEntries && piSessionId != null
      ? withSessionId(input.resumeEntries, piSessionId)
      : input.resumeEntries;
  let savedEntryCount = 0;
  if (input.resumeLeafId != null) {
    if (storage == null) {
      throw new HarnessError({
        message:
          'The Pi lifecycle state was saved through a session storage, but createPi has no sessionStorage to load it from.',
      });
    }
    const storedEntries = await readSessionEntries({
      storage,
      sessionId: input.sessionId,
      leafId: input.resumeLeafId,
      abortSignal: input.abortSignal,
    });
    seededEntries = [
      {
        type: 'session',
        version: CURRENT_SESSION_VERSION,
        id: piSessionId ?? randomUUID(),
        timestamp: new Date().toISOString(),
        cwd: sessionWorkDir,
      },
      ...storedEntries,
    ];
    savedEntryCount = storedEntries.length;
  }
  let sessionManager: SessionManager | undefined;
  const getSessionManager = (): SessionManager => {
    if (sessionManager == null) {
      sessionManager = SessionManager.inMemory(
        sessionWorkDir,
        piSessionId == null ? {} : { id: piSessionId },
        seededEntries == null ? undefined : structuredClone([...seededEntries]),
      );
      if (input.resumeLeafId != null) {
        sessionManager.branch(input.resumeLeafId);
      }
    }
    return sessionManager;
  };
  if (input.resumeLeafId != null) {
    try {
      getSessionManager();
    } catch (error) {
      throw new HarnessError({
        message: `The session storage has no entry "${input.resumeLeafId}" for the Pi session "${input.sessionId}".`,
        cause: error,
      });
    }
  }
  const snapshotUnsavedEntries = ():
    | { entries: PiSessionEntries; count: number; leafId?: string }
    | undefined => {
    const entries =
      sessionManager == null ? seededEntries : sessionEntriesOf(sessionManager);
    if (entries == null) return undefined;
    const [header, ...rest] = entries;
    const unsaved = rest.slice(savedEntryCount);
    return {
      entries: secureJsonParse(
        JSON.stringify([header, ...unsaved]),
      ) as unknown as PiSessionEntries,
      count: unsaved.length,
      ...(storage != null
        ? { leafId: getSessionManager().getLeafId() ?? undefined }
        : {}),
    };
  };

  // Pi auth + model registry are global to this Pi session. These live on the
  // real host filesystem, never in the sandbox/workspace.
  // When `agentDir` is provided, use it instead so the harness can reuse
  // existing CLI logins and model/settings config.
  /*
   * A record-shaped authentication override makes createPiModelRuntime ignore
   * auth.json and models.json because both files can supply credentials from
   * outside that record. General Pi settings still use agentDir below.
   */
  const agentDir = input.agentDir ?? hostAgentDir;
  const nativeAgentDir = resolvePiSubscriptionAgentDir({
    options: input.settings.auth,
    env: process.env,
    agentDir: input.agentDir,
  });
  const modelRuntime = await createPiModelRuntime({
    auth: input.settings.auth,
    credentials: input.settings.credentials,
    authPath: path.join(nativeAgentDir ?? hostAgentDir, 'auth.json'),
    modelsPath: path.join(agentDir, 'models.json'),
  });
  const modelRegistry = new ModelRegistry(modelRuntime);
  // An untrusted project keeps Pi from reading project `.pi/` settings and
  // resources under its working directory, which is `sessionWorkDir`.
  const settingsManager =
    input.agentDir != null
      ? SettingsManager.create(path.join(hostRoot, 'project'), agentDir, {
          projectTrusted: false,
        })
      : SettingsManager.inMemory({}, { projectTrusted: false });

  // Run-scoped env (for the model resolver's gateway fallback heuristic).
  const resolverEnv = resolvePiEnv({
    options: input.settings.auth,
    env: process.env,
  });
  await registerPiProviders({
    options: input.settings.auth,
    resolvedEnv: resolverEnv,
    registries: {
      modelRegistry,
      modelRuntime,
    },
    clientApp: input.clientApp,
    headers: input.settings.headers,
  });
  for (const [provider, config] of Object.entries(
    input.settings.providers ?? {},
  )) {
    modelRegistry.registerProvider(provider, {
      ...modelRegistry.getRegisteredProviderConfig(provider),
      ...config,
    });
  }
  const resolveModel = createPiModelResolver({
    modelRegistry,
    env: resolverEnv,
  });
  let activeResolvedModel = resolveModel();
  const hasMcpServers = mcpServers.length > 0;
  let mcpRegistrationError: unknown;

  let sessionInstructions: string | undefined;

  const extensionSession: PiHarnessExtensionSession = {
    sandboxSession: toolSafeSandboxSession,
    sessionWorkDir,
    instructions: () => sessionInstructions,
  };
  const extensionFactories: ExtensionFactory[] = [
    ...(input.settings.extensionFactories ?? []).map(
      (factory): ExtensionFactory =>
        pi =>
          factory(pi, extensionSession),
    ),
  ];
  if (hasMcpServers) {
    extensionFactories.push(
      createToolSearchExtension(),
      createMcpExtension({
        loadConfig: () => ({ servers: [], errors: [] }),
        logPath: devNull,
        credentials: createInMemoryMcpCredentialStore(),
      }),
      // Pi records an error thrown by an extension factory and loads the
      // session without that extension.
      pi => {
        try {
          for (const [name, config] of mcpServers) {
            pi.registerMcpServer(name, config);
          }
        } catch (error) {
          mcpRegistrationError = error;
        }
      },
    );
  }
  const hasExtensionFactories = extensionFactories.length > 0;
  let preserveExtensionsResult = false;
  let currentExtensionsResult:
    | ReturnType<DefaultResourceLoader['getExtensions']>
    | undefined;

  const resourceLoader = new DefaultResourceLoader({
    cwd: sessionWorkDir,
    agentDir: hostAgentDir,
    settingsManager,
    appendSystemPromptOverride: () =>
      sessionInstructions ? [sessionInstructions] : [],
    extensionFactories,
    ...(hasExtensionFactories
      ? {
          // DefaultResourceLoader invokes inline factories on every reload.
          // Resource-only reloads retain the active extension runtime, while a
          // genuine Pi session rebuild is allowed to replace that runtime.
          extensionsOverride: extensions => {
            if (preserveExtensionsResult && currentExtensionsResult != null) {
              return currentExtensionsResult;
            }
            currentExtensionsResult = extensions;
            return extensions;
          },
        }
      : {}),
    // Pi runs in the host process, where its filesystem discovery would read
    // the host developer's config and execute their extensions.
    noExtensions: true,
    noThemes: true,
    noPromptTemplates: true,
    noSkills: true,
    noContextFiles: true,
    skillsOverride: base => ({
      ...base,
      skills: [...configuredSkills, ...harnessSkills],
    }),
  });
  await resourceLoader.reload();
  if (mcpRegistrationError != null) throw mcpRegistrationError;

  async function reloadResourcesOnly(): Promise<void> {
    if (!hasExtensionFactories) {
      await resourceLoader.reload();
      return;
    }

    const factories = extensionFactories.splice(0);
    preserveExtensionsResult = true;
    try {
      await resourceLoader.reload();
    } finally {
      preserveExtensionsResult = false;
      extensionFactories.push(...factories);
    }
  }

  // Per-session mutable state we hold across prompts.
  let piSession: AgentSession | undefined;
  let unsubscribe: (() => void) | undefined;
  let lastToolsSignature: string | undefined;
  let stopped = false;
  /*
   * Set by `doSuspendTurn` before it aborts the in-flight host turn at a slice
   * boundary. The turn's catch settles silently when this is set, so the stream
   * closes cleanly (no spurious `error` chunk) — the next slice rerun-continues
   * from the persisted journal.
   */
  let suspending = false;
  const pendingToolResults = new Map<string, PendingToolResult>();
  const pendingToolApprovals = new Map<string, PendingToolApproval>();
  let pendingToolBatchToReplay = input.resumePendingToolBatch;
  let replayBarrier: ToolBatchReplayBarrier | undefined;
  /*
   * Built-in approval decisions delivered while no live turn waited for them
   * (the cross-process continuation path). The replayed built-in tool reads
   * its decision from here instead of requesting approval again.
   */
  const nativeApprovalDecisions = new Map<
    string,
    { approved: boolean; reason?: string }
  >();
  /*
   * The current assistant message's tool batch. A cold continuation cannot
   * trust the persisted journal, so checkpoints carry both the host-observed
   * tool calls and every result that finished before the batch parked.
   */
  let currentToolBatch:
    | {
        readonly assistantMessage: PiAssistantMessage;
        readonly completed: Map<string, PiCompletedToolResult>;
      }
    | undefined;
  let currentToolBatchSequential = false;
  let replayingAssistantMessage = false;
  let replaySuppressedToolCallIds = new Set<string>();

  // Emit channel set at the start of every doPromptTurn and cleared on end.
  let currentEmit: ((part: HarnessV1StreamPart) => void) | undefined;
  let translatorState: PiTranslatorState | undefined;
  let activeTurn: ActivePiTurn | undefined;
  /*
   * Compaction parts produced while no turn is active. Pi's `compact()` aborts
   * the current turn before it summarizes, so a manually triggered compaction
   * (and any compaction that lands between turns) emits its `compaction_end`
   * after `currentEmit` has been cleared. Buffer those parts and flush them on
   * the next turn's stream so the observation is not lost. Auto-compaction that
   * runs mid-turn still emits inline via `currentEmit`.
   */
  const pendingCompactionParts: HarnessV1StreamPart[] = [];

  async function applySessionInstructions(
    instructions: string | undefined,
  ): Promise<void> {
    if (instructions === sessionInstructions) return;
    sessionInstructions = instructions;
    await reloadResourcesOnly();
    piSession?.setActiveToolsByName(piSession.getActiveToolNames());
  }

  function settlePendingToolResults(reason: string): void {
    for (const [toolCallId, pending] of pendingToolResults) {
      pending.resolve({ toolCallId, output: { error: reason }, isError: true });
    }
    pendingToolResults.clear();
  }

  function settlePendingToolApprovals(reason: string): void {
    for (const pending of pendingToolApprovals.values()) {
      pending.resolve({ approved: false, reason });
    }
    pendingToolApprovals.clear();
  }

  function getWaitingToolCallIds(): Set<string> {
    return new Set([
      ...pendingToolResults.keys(),
      ...pendingToolApprovals.keys(),
    ]);
  }

  function emitEarlyFinishStepIfReady(): void {
    if (!translatorState || !currentEmit) return;
    for (const part of takePiEarlyFinishStep(translatorState, {
      waitingToolCallIds: getWaitingToolCallIds(),
      sequential: currentToolBatchSequential,
    })) {
      currentEmit(part);
    }
  }

  function trackToolBatch(event: PiSessionEvent, rawEvent: unknown): void {
    const message = event.message as Record<string, unknown> | undefined;
    if (event.type === 'message_end' && message?.role === 'assistant') {
      const toolNames = Array.isArray(message.content)
        ? message.content.flatMap(block =>
            block != null &&
            typeof block === 'object' &&
            (block as { type?: unknown }).type === 'toolCall' &&
            typeof (block as { name?: unknown }).name === 'string'
              ? [(block as { name: string }).name]
              : [],
          )
        : [];
      const assistantMessage = piAssistantMessageSchema.safeParse(
        structuredClone(message),
      );
      currentToolBatch =
        toolNames.length > 0 && assistantMessage.success
          ? { assistantMessage: assistantMessage.data, completed: new Map() }
          : undefined;
      const agent = piSession?.agent;
      currentToolBatchSequential =
        agent != null &&
        (agent.toolExecution === 'sequential' ||
          toolNames.some(
            name =>
              agent.state.tools.find(tool => tool.name === name)
                ?.executionMode === 'sequential',
          ));
      return;
    }
    if (
      event.type === 'tool_execution_end' &&
      event.toolCallId &&
      currentToolBatch != null
    ) {
      const raw = rawEvent as { result?: unknown; isError?: unknown };
      currentToolBatch.completed.set(event.toolCallId, {
        toolCallId: event.toolCallId,
        result:
          raw.result != null && typeof raw.result === 'object'
            ? (raw.result as PiCompletedToolResult['result'])
            : { content: [] },
        isError: raw.isError === true,
      });
    }
  }

  function isReplaySuppressedEvent(event: PiSessionEvent): boolean {
    if (
      replayingAssistantMessage &&
      (event.type === 'message_start' ||
        event.type === 'message_update' ||
        event.type === 'message_end') &&
      event.message?.role === 'assistant'
    ) {
      return true;
    }
    return (
      event.type.startsWith('tool_execution') &&
      event.toolCallId != null &&
      replaySuppressedToolCallIds.has(event.toolCallId)
    );
  }

  /*
   * The state of a tool batch that waits on host input, for a later cold
   * continuation in another process. Undefined when no batch is waiting.
   */
  function createPendingToolBatchCheckpoint(): PiPendingToolBatch | undefined {
    if (replayBarrier != null) return replayBarrier.toCheckpoint();
    if (pendingToolBatchToReplay != null) return pendingToolBatchToReplay;
    const batch = currentToolBatch;
    const awaitingToolCallIds = [...getWaitingToolCallIds()];
    if (batch == null || awaitingToolCallIds.length === 0) return undefined;
    return {
      assistantMessage: batch.assistantMessage,
      awaitingToolCallIds,
      completedToolResults: [...batch.completed.values()].filter(
        result => !awaitingToolCallIds.includes(result.toolCallId),
      ),
      nativeApprovalDecisions: [],
    };
  }

  async function createLifecycleData(
    pendingToolBatch: PiPendingToolBatch | undefined,
    snapshot = snapshotUnsavedEntries(),
  ): Promise<HarnessV1LifecycleState['data']> {
    if (storage != null && snapshot != null && snapshot.count > 0) {
      const [header, ...entries] = snapshot.entries;
      await appendSessionEntries({
        storage,
        sessionId: input.sessionId,
        version: header.version ?? CURRENT_SESSION_VERSION,
        entries,
      });
      savedEntryCount += snapshot.count;
    }
    const data: PiLifecycleData = {
      ...(storage == null
        ? snapshot && { entries: snapshot.entries }
        : snapshot?.leafId && { leafId: snapshot.leafId }),
      ...(pendingToolBatch && { pendingToolBatch }),
    };
    return data as HarnessV1LifecycleState['data'];
  }

  function acceptReplayToolResult(args: HostToolSubmission): void {
    const barrier = replayBarrier;
    if (barrier == null || !barrier.awaiting.has(args.toolCallId)) return;
    barrier.awaiting.delete(args.toolCallId);
    barrier.deliveredHostResults.set(args.toolCallId, args);
    if (barrier.awaiting.size === 0) barrier.start();
  }

  function acceptReplayToolApproval(args: {
    approvalId: string;
    approved: boolean;
    reason?: string;
  }): void {
    const barrier = replayBarrier;
    if (barrier == null || !barrier.awaiting.has(args.approvalId)) return;
    barrier.awaiting.delete(args.approvalId);
    nativeApprovalDecisions.set(args.approvalId, {
      approved: args.approved,
      ...(args.reason !== undefined ? { reason: args.reason } : {}),
    });
    if (barrier.awaiting.size === 0) barrier.start();
  }

  /*
   * Cross-process continuation of a turn whose tool batch waited on host
   * input. The framework delivers that input through `submitToolResult` /
   * `submitToolApproval` right after this returns. Once every waiting call
   * has its input, the batch is replayed: calls that finished before the
   * turn was persisted reuse their results, the others run with the
   * delivered input. If the caller never supplies all of it, the turn stays
   * parked, like a live turn blocked on its tool promises.
   */
  function waitForToolBatchInputThenReplay(
    batch: PiPendingToolBatch,
    continueOpts: HarnessV1ContinueTurnOptions,
  ): HarnessV1PromptControl {
    replayBarrier?.cancel();

    for (const decision of batch.nativeApprovalDecisions) {
      nativeApprovalDecisions.set(decision.toolCallId, {
        approved: decision.approved,
        ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
      });
    }
    const completed = new Map(
      batch.completedToolResults.map(result => [result.toolCallId, result]),
    );
    const awaiting = new Set(batch.awaitingToolCallIds);
    const deliveredHostResults = new Map<string, HostToolSubmission>();
    const deliveredToolResults = (): PiCompletedToolResult[] =>
      [...deliveredHostResults].map(([toolCallId, delivered]) => {
        const converted = toPiHostToolResult(delivered);
        return {
          toolCallId,
          result:
            converted.result as unknown as PiCompletedToolResult['result'],
          isError: converted.isError,
        };
      });

    let resolveDone!: () => void;
    let rejectDone!: (error: unknown) => void;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    let settled = false;

    const start = () => {
      if (settled) return;
      settled = true;
      replayBarrier = undefined;
      const toolResults = new Map(completed);
      for (const result of deliveredToolResults()) {
        toolResults.set(result.toolCallId, result);
      }
      void (async () => {
        try {
          const control = await runTurn({
            text: '',
            images: [],
            ...(continueOpts.model ? { model: continueOpts.model } : {}),
            skills: continueOpts.skills,
            tools: continueOpts.tools ?? [],
            instructions: continueOpts.instructions,
            emit: continueOpts.emit,
            abortSignal: continueOpts.abortSignal,
            replay: {
              assistantMessage: batch.assistantMessage,
              toolResults,
              suppressedToolCallIds: new Set(completed.keys()),
              hostToolResults: deliveredHostResults,
            },
          });
          await control.done;
          resolveDone();
        } catch (error) {
          rejectDone(error);
        }
      })();
    };

    const cancel = (reason?: unknown) => {
      if (settled) return;
      settled = true;
      replayBarrier = undefined;
      if (reason == null) {
        resolveDone();
      } else {
        rejectDone(reason);
      }
    };

    replayBarrier = {
      awaiting,
      deliveredHostResults,
      toCheckpoint: () => ({
        assistantMessage: batch.assistantMessage,
        awaitingToolCallIds: [...awaiting],
        completedToolResults: [
          ...completed.values(),
          ...deliveredToolResults(),
        ],
        nativeApprovalDecisions: [...nativeApprovalDecisions].map(
          ([toolCallId, decision]) => ({ toolCallId, ...decision }),
        ),
      }),
      start,
      cancel,
    };

    const abortBarrier = () => {
      cancel(
        continueOpts.abortSignal?.reason ??
          new Error(
            'Pi turn was aborted before its host tool results were delivered.',
          ),
      );
    };
    if (continueOpts.abortSignal?.aborted) {
      abortBarrier();
    } else {
      continueOpts.abortSignal?.addEventListener('abort', abortBarrier, {
        once: true,
      });
    }

    if (awaiting.size === 0) start();

    return createPromptControl({
      done,
      abortSignal: continueOpts.abortSignal,
    });
  }

  function createPromptControl(input: {
    done: Promise<void>;
    abortSignal?: AbortSignal;
    abort?: (reason?: unknown) => Promise<void>;
  }): HarnessV1PromptControl {
    const abortHandler = () => {
      void input.abort?.(input.abortSignal?.reason);
    };
    if (input.abortSignal) {
      if (input.abortSignal.aborted) {
        abortHandler();
      } else {
        input.abortSignal.addEventListener('abort', abortHandler, {
          once: true,
        });
      }
      void input.done.then(
        () => {
          input.abortSignal?.removeEventListener('abort', abortHandler);
        },
        () => {
          input.abortSignal?.removeEventListener('abort', abortHandler);
        },
      );
    }

    return {
      async submitToolResult(args) {
        const pending = pendingToolResults.get(args.toolCallId);
        if (!pending) {
          acceptReplayToolResult(args);
          return;
        }
        pendingToolResults.delete(args.toolCallId);
        /*
         * Preserve the original output so the result projection can surface it
         * unchanged. The tool handler stringifies the output for the runtime
         * (so the model reads it), and Pi echoes that text back — without this
         * the consumer-facing result would be the serialized string instead of
         * the original object.
         */
        translatorState?.hostToolResults.set(args.toolCallId, args.output);
        pending.resolve(args);
      },
      async submitToolApproval(args) {
        const pending = pendingToolApprovals.get(args.approvalId);
        if (!pending) {
          acceptReplayToolApproval(args);
          return;
        }
        pendingToolApprovals.delete(args.approvalId);
        pending.resolve({
          approved: args.approved,
          reason: args.reason,
        });
      },
      async submitUserMessage(text) {
        const session = piSession;
        if (session == null) {
          throw new Error('Pi has no active runtime session to steer.');
        }
        await session.steer(
          await expandPiSkillCommand({
            text,
            skills: resourceLoader.getSkills().skills,
            sandbox: toolSafeSandboxSession,
          }),
        );
      },
      done: input.done,
    };
  }

  async function requestBuiltinToolApproval(args: {
    toolCallId: string;
    nativeName: (typeof PI_NATIVE_BUILTIN_NAMES)[number];
  }): Promise<{ approved: boolean; reason?: string }> {
    if (
      !piBuiltinToolRequiresApproval({
        permissionMode,
        kind: PI_NATIVE_TOOL_KINDS[args.nativeName],
      })
    ) {
      return { approved: true };
    }
    const deliveredDecision = nativeApprovalDecisions.get(args.toolCallId);
    if (deliveredDecision != null) {
      nativeApprovalDecisions.delete(args.toolCallId);
      return deliveredDecision;
    }
    currentEmit?.({
      type: 'tool-approval-request',
      approvalId: args.toolCallId,
      toolCallId: args.toolCallId,
    });
    return new Promise(resolve => {
      pendingToolApprovals.set(args.toolCallId, { resolve });
      emitEarlyFinishStepIfReady();
    });
  }

  function buildToolDefinitions(userTools: ReadonlyArray<HarnessV1ToolSpec>): {
    customTools: ToolDefinition[];
    builtinNames: string[];
  } {
    const builtinNames = activeBuiltinNames;
    const customTools: ToolDefinition[] = [
      ...builtinNames.map(native =>
        buildBuiltinToolDefinition({
          native,
          sessionWorkDir,
          remoteOps: async () => (await resolveSandboxPaths()).remoteOps,
          requestApproval: requestBuiltinToolApproval,
        }),
      ),
      ...userTools.map(spec =>
        buildUserToolDefinition({
          spec,
          pending: pendingToolResults,
          onPending: emitEarlyFinishStepIfReady,
        }),
      ),
    ];
    return {
      customTools,
      builtinNames: [...builtinNames],
    };
  }

  async function disposePiSession({
    reason,
  }: {
    reason: 'reload' | 'quit';
  }): Promise<void> {
    unsubscribe?.();
    unsubscribe = undefined;

    const session = piSession;
    piSession = undefined;
    if (!session) return;

    if (hasMcpServers) {
      await session.extensionRunner
        .emit({ type: 'session_shutdown', reason })
        .catch(() => {});
    }
    session.dispose();
  }

  async function rebuildPiSession(
    userTools: ReadonlyArray<HarnessV1ToolSpec>,
  ): Promise<boolean> {
    let resourcesReloaded = false;
    if (piSession) {
      await disposePiSession({ reason: 'reload' });
      // Original adapter waits 25 ms here to let Pi's teardown microtasks
      // settle before the next createAgentSession. Port verbatim.
      // TODO(pi-0.77): verify the race still exists; original SDK had a
      // teardown microtask the host needed to wait on.
      await new Promise(resolve => setTimeout(resolve, 25));
      if (hasExtensionFactories) {
        // dispose() invalidates Pi's current extension runtime, so a replacement
        // AgentSession needs factories to create a fresh runtime before build.
        await resourceLoader.reload();
        resourcesReloaded = true;
      }
    }

    const { customTools, builtinNames } = buildToolDefinitions(userTools);
    const toolNames = customTools.map(t => t.name);

    const { session } = await createAgentSession({
      cwd: sessionWorkDir,
      agentDir: hostAgentDir,
      modelRuntime,
      sessionManager: getSessionManager(),
      settingsManager,
      resourceLoader,
      customTools,
      ...(hasExtensionFactories
        ? { noTools: 'builtin' as const }
        : { tools: toolNames }),
      ...(input.settings.thinkingLevel
        ? { thinkingLevel: input.settings.thinkingLevel }
        : {}),
      ...(activeResolvedModel ? { model: activeResolvedModel } : {}),
    });
    piSession = session;
    const cacheRetention = input.settings.cacheRetention;
    if (cacheRetention) {
      const streamFunction = session.agent.streamFunction;
      session.agent.streamFunction = (model, context, options) =>
        streamFunction(model, context, {
          ...options,
          cacheRetention: options?.cacheRetention ?? cacheRetention,
        });
    }
    if (hasMcpServers) {
      await piSession.bindExtensions({ mode: 'print' });
    }

    translatorState = createPiTranslatorState({
      builtinToolNames: builtinNames,
      hostToolNames: userTools.map(tool => tool.name),
      nativeToCommon: activeNativeToCommon,
    });

    unsubscribe = piSession.subscribe(rawEvent => {
      if (!translatorState) return;
      const event = parseNativeEvent(rawEvent);
      if (!event) return;
      trackToolBatch(event, rawEvent);
      /*
       * During a tool batch replay, the replayed assistant message and calls
       * that finished before the turn was persisted were already reported
       * to the consumer. Their events still update the translator state so
       * step accounting stays intact; only step boundaries are forwarded.
       */
      const suppressed = isReplaySuppressedEvent(event);
      for (const part of translatePiEvent(event, translatorState)) {
        if (suppressed && part.type !== 'finish-step') continue;
        if (currentEmit) {
          currentEmit(part);
        } else if (part.type === 'compaction') {
          // No active turn: defer compaction observations to the next turn.
          pendingCompactionParts.push(part);
        }
        // Other event types outside a turn have no consumer and are dropped.
      }
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        replayingAssistantMessage = false;
      }
      emitEarlyFinishStepIfReady();
    });
    return resourcesReloaded;
  }

  /*
   * Drive one turn against the Pi session and return the control surface.
   * Shared by `doPromptTurn` (a fresh user prompt) and `doContinueTurn` (an empty
   * prompt that asks Pi to continue its own thread after a rerun resume).
   */
  async function runTurn(turnOpts: {
    text: string;
    images: PiPromptContent['images'];
    model?: string;
    skills: ReadonlyArray<HarnessV1Skill>;
    tools: ReadonlyArray<HarnessV1ToolSpec>;
    instructions?: string;
    emit: (part: HarnessV1StreamPart) => void;
    abortSignal?: AbortSignal;
    replay?: PiToolBatchReplay;
  }): Promise<HarnessV1PromptControl> {
    if (stopped) {
      throw new Error('Pi session has been stopped.');
    }

    const nextModel =
      turnOpts.model == null ? undefined : resolveModel(turnOpts.model);
    if (turnOpts.model != null && nextModel == null) {
      throw new HarnessCapabilityUnsupportedError({
        message: `Harness 'pi' has no model '${turnOpts.model}' in its catalog.`,
        harnessId: HARNESS_ID,
      });
    }
    const turnModel = nextModel ?? activeResolvedModel;
    if (
      turnOpts.images.length > 0 &&
      turnModel != null &&
      !turnModel.input.includes('image')
    ) {
      throw new HarnessCapabilityUnsupportedError({
        message: `Harness 'pi' model '${turnModel.id}' does not support image input.`,
        harnessId: HARNESS_ID,
      });
    }

    if (turnOpts.skills.length > 0 || harnessSkills.length > 0) {
      const { homeDir, skillRootDir } = await resolveSandboxPaths();
      const skillWriteResult = await writeSkills({
        sandbox: toolSafeSandboxSession,
        homePath: homeDir,
        skillsDir: '.agents/skills',
        skills: turnOpts.skills,
        abortSignal: turnOpts.abortSignal,
        invalidSkillNameMessage: ({ name }) => `Invalid Pi skill name: ${name}`,
        invalidSkillFilePathMessage: ({ skillName, filePath }) =>
          `Invalid Pi skill file path for ${skillName}: ${filePath}`,
      });
      harnessSkills = createHarnessPiSkills({
        skills: turnOpts.skills,
        sandboxSkillRootDir: skillRootDir,
      });
      if (piSession != null && skillWriteResult.changed) {
        await reloadResourcesOnly();
      }
    }

    const userTools = turnOpts.tools;
    currentEmit = turnOpts.emit;
    const turnAbortController = new AbortController();
    const abort = async (reason?: unknown): Promise<void> => {
      if (turnAbortController.signal.aborted) return;
      if (reason === undefined) {
        turnAbortController.abort();
      } else {
        turnAbortController.abort(reason);
      }
      await Promise.resolve(piSession?.abort()).catch(() => {});
    };

    const turnPromise = (async () => {
      let stage: 'preparing' | 'prompting' = 'preparing';
      try {
        await applySessionInstructions(turnOpts.instructions);
        turnAbortController.signal.throwIfAborted();

        /*
         * The restored journal must be moved back to before the tool batch
         * before the Pi session builds its transcript from it.
         */
        const replayBatch = (() => {
          if (turnOpts.replay == null || piSession != null) return undefined;
          if (seededEntries == null) {
            throw new Error(
              'Pi session journal is missing for the parked tool batch.',
            );
          }
          return takeToolBatchForReplay({
            journal: getSessionManager(),
            expectedAssistantMessage: turnOpts.replay.assistantMessage,
          });
        })();
        const replayToolResults = new Map(turnOpts.replay?.toolResults);
        const replaySuppressed = new Set(
          turnOpts.replay?.suppressedToolCallIds,
        );

        if (nextModel != null) activeResolvedModel = nextModel;

        const signature = JSON.stringify(userTools.map(t => t.name).sort());
        const needsRebuild =
          piSession == null || signature !== lastToolsSignature;
        let resourcesReloaded = false;
        if (needsRebuild) {
          resourcesReloaded = await rebuildPiSession(userTools);
          turnAbortController.signal.throwIfAborted();
          lastToolsSignature = signature;
        } else if (
          nextModel != null &&
          piSession != null &&
          (piSession.model?.provider !== nextModel.provider ||
            piSession.model.id !== nextModel.id)
        ) {
          await piSession.setModel(nextModel);
          turnAbortController.signal.throwIfAborted();
        }

        if (!resourcesReloaded) {
          await reloadResourcesOnly();
          turnAbortController.signal.throwIfAborted();
        }

        // Fresh translator state for the new turn — keep the tool sets the
        // session was built with.
        const turnState = createPiTranslatorState({
          builtinToolNames: activeBuiltinNames,
          hostToolNames: userTools.map(tool => tool.name),
          nativeToCommon: activeNativeToCommon,
        });
        translatorState = turnState;

        currentEmit?.({
          type: 'stream-start',
          ...(piSession?.model?.id ? { modelId: piSession.model.id } : {}),
        });

        for (const [toolCallId, delivered] of turnOpts.replay
          ?.hostToolResults ?? []) {
          translatorState.hostToolResults.set(toolCallId, delivered.output);
        }

        const session = piSession!;
        const tokensBefore = session.getSessionStats().tokens;
        stage = 'prompting';
        if (replayBatch != null) {
          replaySuppressedToolCallIds = replaySuppressed;
          try {
            await runToolBatchReplay({
              agent: session.agent,
              assistantMessage: replayBatch.assistantMessage,
              toolResults: replayToolResults,
              onReplayedMessage: () => {
                replayingAssistantMessage = true;
              },
            });
          } finally {
            replaySuppressedToolCallIds = new Set();
            replayingAssistantMessage = false;
          }
        } else {
          const text = await expandPiSkillCommand({
            text: turnOpts.text,
            skills: resourceLoader.getSkills().skills,
            sandbox: toolSafeSandboxSession,
            abortSignal: turnAbortController.signal,
          });
          turnAbortController.signal.throwIfAborted();
          await session.prompt(text, { images: turnOpts.images });
        }

        const terminalError = turnState.lastAssistantError;
        if (terminalError) throw new Error(terminalError);

        const tokensAfter = session.getSessionStats().tokens;
        const finishReason = {
          unified: 'stop' as const,
          raw: undefined,
        };
        currentEmit?.({
          type: 'finish',
          finishReason,
          totalUsage: toHarnessUsage({
            input: tokensAfter.input - tokensBefore.input,
            output: tokensAfter.output - tokensBefore.output,
            cacheRead: tokensAfter.cacheRead - tokensBefore.cacheRead,
            cacheWrite: tokensAfter.cacheWrite - tokensBefore.cacheWrite,
            reasoning: turnState.turnReasoningTokens,
          }),
        });
      } catch (err) {
        if (suspending) return;
        if (stage === 'preparing') throw err;
        currentEmit?.({ type: 'error', error: err });
      }
    })();

    const activeTurnToken = {};
    const done = turnPromise.finally(() => {
      if (activeTurn?.token === activeTurnToken) {
        activeTurn = undefined;
        currentEmit = undefined;
      }
    });
    activeTurn = {
      token: activeTurnToken,
      done,
      abort,
    };

    return createPromptControl({
      done,
      abortSignal: turnOpts.abortSignal,
      abort,
    });
  }

  const doStop = async (): Promise<HarnessV1ResumeSessionState> => {
    if (stopped) {
      throw new Error('Pi session has been stopped.');
    }
    stopped = true;
    parkedPiSessions.delete(input.sessionId);
    /*
     * A tool batch waiting on host input is checkpointed before the turn is
     * aborted: aborting settles the waiting calls with errors, which must not
     * reach the persisted journal a later continuation replays.
     */
    const pendingToolBatch = createPendingToolBatchCheckpoint();
    replayBarrier?.cancel();
    const snapshotBeforeAbort = pendingToolBatch && snapshotUnsavedEntries();
    const turnToStop = activeTurn;
    const abortingTurn = turnToStop?.abort();
    settlePendingToolResults('Pi session stopped');
    settlePendingToolApprovals('Pi session stopped');
    await abortingTurn;
    await turnToStop?.done.catch(() => {});

    let data: HarnessV1LifecycleState['data'];
    try {
      data = await createLifecycleData(pendingToolBatch, snapshotBeforeAbort);
    } finally {
      await disposePiSession({ reason: 'quit' });
      await rm(hostRoot, { recursive: true, force: true });
    }

    return {
      type: 'resume-session',
      harnessId: HARNESS_ID,
      specificationVersion: 'harness-v1',
      data,
    };
  };

  const sessionImpl: HarnessV1Session = {
    sessionId: input.sessionId,
    isResume: input.isResume,

    doPromptTurn: async (
      promptOpts: HarnessV1PromptTurnOptions,
    ): Promise<HarnessV1PromptControl> => {
      if (promptOpts.responseFormat?.type === 'json') {
        throw new HarnessCapabilityUnsupportedError({
          message: "Harness 'pi' does not support structured output.",
          harnessId: HARNESS_ID,
        });
      }
      pendingToolBatchToReplay = undefined;
      replayBarrier?.cancel();
      const { text, images } = extractPiPromptContent({
        prompt: promptOpts.prompt,
      });
      return runTurn({
        text,
        images,
        ...(promptOpts.model ? { model: promptOpts.model } : {}),
        skills: promptOpts.skills,
        tools: promptOpts.tools ?? [],
        instructions: promptOpts.instructions,
        emit: promptOpts.emit,
        abortSignal: promptOpts.abortSignal,
      });
    },

    doContinueTurn: async (
      continueOpts: HarnessV1ContinueTurnOptions,
    ): Promise<HarnessV1PromptControl> => {
      if (continueOpts.responseFormat?.type === 'json') {
        throw new HarnessCapabilityUnsupportedError({
          message: "Harness 'pi' does not support structured output.",
          harnessId: HARNESS_ID,
        });
      }
      if (activeTurn != null) {
        currentEmit = continueOpts.emit;
        return createPromptControl({
          done: activeTurn.done,
          abortSignal: continueOpts.abortSignal,
          abort: activeTurn.abort,
        });
      }

      if (stopped) {
        throw new Error('Pi session has been stopped.');
      }

      const pendingToolBatch =
        replayBarrier?.toCheckpoint() ?? pendingToolBatchToReplay;
      pendingToolBatchToReplay = undefined;
      if (pendingToolBatch != null && piSession == null) {
        return waitForToolBatchInputThenReplay(pendingToolBatch, continueOpts);
      }

      /*
       * Pi runs the model on the host, so there is no live turn in the sandbox
       * to attach to — the previous slice's turn died with its process.
       * Rerun-continue: re-drive the agent from the journal restored on resume.
       * An empty prompt asks Pi to continue its own thread. Lossy — any work in
       * flight at the slice boundary is recomputed because a host-resident
       * runtime cannot do a lossless attach.
       */
      return runTurn({
        text: '',
        images: [],
        ...(continueOpts.model ? { model: continueOpts.model } : {}),
        skills: continueOpts.skills,
        tools: continueOpts.tools ?? [],
        instructions: continueOpts.instructions,
        emit: continueOpts.emit,
        abortSignal: continueOpts.abortSignal,
      });
    },

    doCompact: async (customInstructions?: string) => {
      if (stopped) {
        throw new Error('Pi session has been stopped.');
      }
      if (piSession == null) {
        await rebuildPiSession([]);
        lastToolsSignature = JSON.stringify([]);
      }
      const session = piSession;
      if (session == null) {
        throw new Error('Pi session failed to initialize.');
      }
      /*
       * Pi owns the compaction. We just request it; the resulting
       * `compaction_end` event is observed by the session subscription and
       * translated into a `compaction` stream part. The returned
       * `CompactionResult` is intentionally discarded here.
       */
      await session.compact(customInstructions);
    },

    doDestroy: async () => {
      if (stopped) return;
      stopped = true;
      parkedPiSessions.delete(input.sessionId);
      replayBarrier?.cancel();
      const turnToDestroy = activeTurn;
      const abortingTurn = turnToDestroy?.abort();
      settlePendingToolResults('Pi session stopped');
      settlePendingToolApprovals('Pi session stopped');
      await abortingTurn;
      await turnToDestroy?.done.catch(() => {});
      await disposePiSession({ reason: 'quit' });
      await rm(hostRoot, { recursive: true, force: true });
    },

    doStop,

    doDetach: async (): Promise<HarnessV1ResumeSessionState> => {
      if (
        input.settings.reattachInProcess !== false &&
        (activeTurn != null || pendingToolResults.size > 0)
      ) {
        parkedPiSessions.set(input.sessionId, {
          session: sessionImpl,
          input,
          stateType: 'resume-session',
        });
        const pendingToolBatch = createPendingToolBatchCheckpoint();
        return {
          type: 'resume-session',
          harnessId: HARNESS_ID,
          specificationVersion: 'harness-v1',
          data: await createLifecycleData(pendingToolBatch),
        };
      }
      return doStop();
    },

    doSuspendTurn: async (): Promise<HarnessV1ContinueTurnState> => {
      if (stopped) {
        throw new Error('Pi session has been stopped.');
      }
      if (
        input.settings.reattachInProcess !== false &&
        activeTurn != null &&
        (pendingToolResults.size > 0 || pendingToolApprovals.size > 0)
      ) {
        parkedPiSessions.set(input.sessionId, {
          session: sessionImpl,
          input,
          stateType: 'continue-turn',
        });
        const pendingToolBatch = createPendingToolBatchCheckpoint();
        return {
          type: 'continue-turn',
          harnessId: HARNESS_ID,
          specificationVersion: 'harness-v1',
          data: await createLifecycleData(pendingToolBatch),
        };
      }
      /*
       * Pi's model runs in this host process, which is about to be suspended at
       * the slice boundary — the in-flight turn cannot survive it. Abort it (the
       * turn settles silently via the `suspending` guard so the stream closes
       * cleanly), return the journal in the lifecycle state, and tear down
       * host-side resources. The next slice seeds a new Pi session from it and
       * rerun-continues. The tail in flight at the boundary is recomputed — Pi
       * cannot freeze a live turn the way a bridge adapter can.
       */
      /*
       * Same as `doStop`: checkpoint a tool batch waiting on host input
       * before the abort settles its calls with errors.
       */
      const pendingToolBatch = createPendingToolBatchCheckpoint();
      replayBarrier?.cancel();
      const snapshotBeforeAbort = pendingToolBatch && snapshotUnsavedEntries();
      suspending = true;
      const turnToSuspend = activeTurn;
      const abortingTurn = turnToSuspend?.abort();
      settlePendingToolResults('Pi session suspended');
      settlePendingToolApprovals('Pi session suspended');
      await abortingTurn;
      await turnToSuspend?.done.catch(() => {});

      let data: HarnessV1LifecycleState['data'];
      try {
        data = await createLifecycleData(pendingToolBatch, snapshotBeforeAbort);
      } finally {
        stopped = true;
        parkedPiSessions.delete(input.sessionId);
        await disposePiSession({ reason: 'quit' });
        await rm(hostRoot, { recursive: true, force: true });
      }

      return {
        type: 'continue-turn',
        harnessId: HARNESS_ID,
        specificationVersion: 'harness-v1',
        data,
      };
    },
  };

  return sessionImpl;
}

const PI_CODEMODE_EXPOSURES: ReadonlyArray<unknown> = [
  'codemode',
  'codemode-deferred',
];

function resolvePiMcpServers(
  mcpServers: PiSessionSettings['mcpServers'],
): Array<[name: string, config: PiMcpServerConfig]> {
  return Object.entries(mcpServers ?? {}).map(([name, config]) => {
    const exposures: unknown[] = [
      config.exposure,
      ...Object.values(config.toolExposure ?? {}),
    ];
    if (exposures.some(exposure => PI_CODEMODE_EXPOSURES.includes(exposure))) {
      throw new Error(
        `Pi MCP server ${JSON.stringify(name)} uses the codemode exposure, which is not supported: the harness does not load Pi's codemode extension. Use 'direct', 'deferred' or 'hidden'.`,
      );
    }
    return [
      name,
      {
        ...config,
        exposure: config.exposure === undefined ? 'direct' : config.exposure,
      },
    ];
  });
}

type PiMcpCredentialStore = NonNullable<
  NonNullable<Parameters<typeof createMcpExtension>[0]>['credentials']
>;
type PiMcpServerCredentialStore = ReturnType<PiMcpCredentialStore['forServer']>;
type PiMcpOAuthState = Parameters<PiMcpServerCredentialStore['save']>[0];

// Pi's default store is `mcp-auth.json` in the host agent directory, so a
// server without an Authorization header would be sent the tokens of whoever
// signed in to it with the Pi CLI on this machine.
function createInMemoryMcpCredentialStore(): PiMcpCredentialStore {
  const states = new Map<string, PiMcpOAuthState>();
  const keyOf = (name: string, serverUrl: string) => `${name}|${serverUrl}`;
  const store: Pick<PiMcpCredentialStore, 'forServer' | 'tokens' | 'remove'> = {
    forServer: (name, serverUrl) => ({
      load: () => states.get(keyOf(name, serverUrl)),
      save: state => {
        states.set(keyOf(name, serverUrl), state);
      },
      withRefreshLock: fn => fn(),
    }),
    tokens: (name, serverUrl) => states.get(keyOf(name, serverUrl))?.tokens,
    remove: (name, serverUrl) => states.delete(keyOf(name, serverUrl)),
  };
  // Pi types the option as its store class, which has private members.
  return store as PiMcpCredentialStore;
}

function assertPiMcpSettingsSupported(
  mcpSettings: PiMcpSettings | undefined,
): void {
  if (mcpSettings?.toolPrefix != null && mcpSettings.toolPrefix !== 'mcp') {
    throw new Error(
      `Pi MCP setting toolPrefix ${JSON.stringify(mcpSettings.toolPrefix)} is not supported: Pi's native MCP always names tools mcp__<server>__<tool>.`,
    );
  }
  if (mcpSettings?.outputGuard === false) {
    throw new Error(
      "Pi MCP setting outputGuard false is not supported: Pi's native MCP always truncates results over 20 KB and writes the full text to a file in the host temp directory.",
    );
  }
}

function asPiToolResult(text: string): AgentToolResult<unknown> {
  return {
    content: [{ type: 'text', text }],
    details: null,
  };
}

async function maybeDenyPiBuiltinTool(input: {
  toolCallId: string;
  nativeName: (typeof PI_NATIVE_BUILTIN_NAMES)[number];
  requestApproval: (args: {
    toolCallId: string;
    nativeName: (typeof PI_NATIVE_BUILTIN_NAMES)[number];
  }) => Promise<{ approved: boolean; reason?: string }>;
}): Promise<AgentToolResult<unknown> | undefined> {
  const decision = await input.requestApproval({
    toolCallId: input.toolCallId,
    nativeName: input.nativeName,
  });
  if (decision.approved) return undefined;
  return asPiToolResult(
    serializeToolOutput({
      type: 'execution-denied',
      reason: decision.reason,
    }),
  );
}

function piBuiltinToolRequiresApproval(input: {
  permissionMode: HarnessV1PermissionMode;
  kind: 'readonly' | 'edit' | 'bash';
}): boolean {
  if (input.permissionMode === 'allow-all') return false;
  if (input.permissionMode === 'allow-edits') return input.kind === 'bash';
  return input.kind === 'edit' || input.kind === 'bash';
}

function buildBuiltinToolDefinition(input: {
  native: (typeof PI_NATIVE_BUILTIN_NAMES)[number];
  sessionWorkDir: string;
  remoteOps: () => Promise<PiRemoteOps>;
  requestApproval: (args: {
    toolCallId: string;
    nativeName: (typeof PI_NATIVE_BUILTIN_NAMES)[number];
  }) => Promise<{ approved: boolean; reason?: string }>;
}): ToolDefinition {
  switch (input.native) {
    case 'read':
      return defineTool({
        name: 'read',
        label: 'read',
        description: createReadToolDefinition(input.sessionWorkDir).description,
        parameters: Type.Object({
          file_path: Type.String(),
          offset: Type.Optional(
            Type.Integer({
              minimum: 1,
              description: 'Line number to start reading from (1-indexed).',
            }),
          ),
          limit: Type.Optional(
            Type.Integer({
              minimum: 1,
              description: 'Maximum number of lines to read.',
            }),
          ),
        }),
        async execute(toolCallId, params, signal, onUpdate, ctx) {
          const denied = await maybeDenyPiBuiltinTool({
            toolCallId,
            nativeName: 'read',
            requestApproval: input.requestApproval,
          });
          if (denied) return denied;
          const ops = await input.remoteOps();
          // Pi expands `~` against the host home, so map the path first.
          const sandboxPath = ops.paths.toReadableSandboxPath(params.file_path);
          return executePiSandboxRead(
            ops,
            input.sessionWorkDir,
            toolCallId,
            { path: sandboxPath, offset: params.offset, limit: params.limit },
            signal,
            onUpdate,
            ctx,
          );
        },
      });
    case 'write':
      return defineTool({
        name: 'write',
        label: 'write',
        description: 'Write content to a file.',
        parameters: Type.Object({
          file_path: Type.String(),
          content: Type.String(),
        }),
        async execute(toolCallId, params) {
          const denied = await maybeDenyPiBuiltinTool({
            toolCallId,
            nativeName: 'write',
            requestApproval: input.requestApproval,
          });
          if (denied) return denied;
          const ops = await input.remoteOps();
          await ops.writeFile(params.file_path, params.content);
          return asPiToolResult(`Wrote ${params.file_path}`);
        },
      });
    case 'edit':
      return defineTool({
        name: 'edit',
        label: 'edit',
        description: 'Edit a file by exact-string replacement.',
        parameters: Type.Object({
          file_path: Type.String(),
          old_string: Type.String(),
          new_string: Type.String(),
        }),
        async execute(toolCallId, params) {
          const denied = await maybeDenyPiBuiltinTool({
            toolCallId,
            nativeName: 'edit',
            requestApproval: input.requestApproval,
          });
          if (denied) return denied;
          const ops = await input.remoteOps();
          await ops.editFile(
            params.file_path,
            params.old_string,
            params.new_string,
          );
          return asPiToolResult(`Edited ${params.file_path}`);
        },
      });
    case 'bash':
      return defineTool({
        name: 'bash',
        label: 'bash',
        description: 'Execute a shell command.',
        parameters: Type.Object({
          command: Type.String(),
          timeout: Type.Optional(
            Type.Number({ description: 'Timeout in seconds.' }),
          ),
        }),
        async execute(toolCallId, params, signal) {
          const denied = await maybeDenyPiBuiltinTool({
            toolCallId,
            nativeName: 'bash',
            requestApproval: input.requestApproval,
          });
          if (denied) return denied;
          const ops = await input.remoteOps();
          const chunks: Buffer[] = [];
          const result = await ops.exec(params.command, '.', {
            onData(data) {
              chunks.push(data);
            },
            ...(signal ? { signal } : {}),
            ...(typeof params.timeout === 'number'
              ? { timeout: params.timeout }
              : {}),
          });
          const out = Buffer.concat(chunks).toString('utf8');
          const text = `${out}${
            result.exitCode != null ? `\n\n(exit ${result.exitCode})` : ''
          }`.trim();
          return asPiToolResult(
            truncatePiToolOutputTail(
              text,
              'Re-run the command with narrower output, or redirect it to a file and use read with offset and limit.',
            ),
          );
        },
      });
    case 'grep':
      return defineTool({
        name: 'grep',
        label: 'grep',
        description: 'Search file contents with regex.',
        parameters: Type.Object({
          pattern: Type.String(),
          path: Type.Optional(Type.String()),
          glob: Type.Optional(Type.String()),
          ignoreCase: Type.Optional(Type.Boolean()),
          literal: Type.Optional(Type.Boolean()),
          context: Type.Optional(Type.Number()),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(toolCallId, params) {
          const denied = await maybeDenyPiBuiltinTool({
            toolCallId,
            nativeName: 'grep',
            requestApproval: input.requestApproval,
          });
          if (denied) return denied;
          const ops = await input.remoteOps();
          const out = await ops.grepFiles(params.pattern, params);
          return asPiToolResult(
            truncatePiToolOutputHead(
              out,
              'Narrow the pattern or path, or read the matching file with offset and limit.',
            ),
          );
        },
      });
    case 'find':
      return defineTool({
        name: 'find',
        label: 'find',
        description: 'Find files matching a glob pattern.',
        parameters: Type.Object({
          pattern: Type.String(),
          path: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(toolCallId, params) {
          const denied = await maybeDenyPiBuiltinTool({
            toolCallId,
            nativeName: 'find',
            requestApproval: input.requestApproval,
          });
          if (denied) return denied;
          const ops = await input.remoteOps();
          const matches = await ops.findFiles(
            params.pattern,
            params.path ?? '.',
            params.limit ?? 1_000,
          );
          return asPiToolResult(
            truncatePiToolOutputHead(
              matches.join('\n'),
              'Narrow the pattern or search path to inspect the omitted matches.',
            ),
          );
        },
      });
    case 'ls':
      return defineTool({
        name: 'ls',
        label: 'ls',
        description: 'List directory entries.',
        parameters: Type.Object({
          path: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(toolCallId, params) {
          const denied = await maybeDenyPiBuiltinTool({
            toolCallId,
            nativeName: 'ls',
            requestApproval: input.requestApproval,
          });
          if (denied) return denied;
          const ops = await input.remoteOps();
          const entries = await ops.listDirectory(
            params.path ?? '.',
            params.limit ?? 500,
          );
          return asPiToolResult(
            truncatePiToolOutputHead(
              entries.join('\n'),
              'List a narrower directory path to inspect the omitted entries.',
            ),
          );
        },
      });
  }
}

function toPiHostToolResult(submission: HostToolSubmission): {
  result: AgentToolResult<unknown>;
  isError: boolean;
} {
  const continuation =
    'Call the tool again with narrower parameters to inspect the omitted output.';
  if (submission.toolResult == null) {
    return {
      result: asPiToolResult(
        truncatePiToolOutputHead(
          serializeToolOutput(submission.output),
          continuation,
        ),
      ),
      isError: submission.isError === true,
    };
  }
  const converted = convertHarnessToolModelOutput({
    output: submission.toolResult.output,
  });
  const content = truncatePiToolModelOutput({
    content: converted.content,
    continuation,
  });
  return {
    result: {
      content: content.map(part =>
        part.type === 'text'
          ? part
          : {
              type: 'image' as const,
              data: part.data,
              mimeType: part.mediaType,
            },
      ),
      details: undefined,
    },
    isError: submission.isError === true || converted.isError,
  };
}

function buildUserToolDefinition({
  spec,
  pending,
  onPending,
}: {
  spec: HarnessV1ToolSpec;
  pending: Map<string, PendingToolResult>;
  onPending: () => void;
}): ToolDefinition {
  const schema = spec.inputSchema ?? {
    type: 'object',
    properties: {},
    additionalProperties: true,
  };
  return defineTool({
    name: spec.name,
    label: spec.name,
    description: spec.description ?? `User-registered tool ${spec.name}`,
    parameters: toolSpecToTypeBoxParameters(schema),
    async execute(toolCallId) {
      return new Promise<HostToolSubmission>(resolve => {
        pending.set(toolCallId, { resolve });
        onPending();
      }).then(submission => {
        const converted = toPiHostToolResult(submission);
        if (submission.toolResult != null && converted.isError) {
          throw new Error(
            converted.result.content
              .filter(part => part.type === 'text')
              .map(part => part.text)
              .join('\n'),
          );
        }
        return converted.result;
      });
    },
  });
}
