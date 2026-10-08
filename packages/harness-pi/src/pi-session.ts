import {
  createAgentSession,
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
import { mkdir, rm } from 'node:fs/promises';
import { devNull, tmpdir } from 'node:os';
import path from 'node:path';
import { Type } from 'typebox';
import {
  HarnessCapabilityUnsupportedError,
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
import { parseNativeEvent } from './pi-events';
import { createPiTurnSettle } from './pi-turn-settle';
import { createPiModelResolver } from './pi-model-resolver';
import { createPiPathMapper } from './pi-paths';
import {
  createPiRemoteOps,
  resolvePiSandboxPathOrParent,
  type PiRemoteOps,
} from './pi-remote-ops';
import { executePiSandboxRead } from './pi-read-operations';
import {
  truncatePiToolOutputHead,
  truncatePiToolOutputTail,
} from './pi-tool-result';
import {
  sessionEntriesOf,
  withSessionId,
  type PiSessionEntries,
} from './pi-lifecycle-state';
import {
  createPiTranslatorState,
  finishPiApprovalStep,
  toHarnessUsage,
  translatePiEvent,
  type PiTranslatorState,
} from './pi-translate';
import { toolSpecToTypeBoxParameters } from './pi-typebox-adapter';
import {
  extractUserText,
  safePiMetadataSegment,
  serializeToolOutput,
} from './pi-utils';

const HARNESS_ID = 'pi';

const PI_SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

const sessionsParkedOnHostInput = new Map<
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

export interface PiFileToolPathPolicy {
  readonly readableRoots?: ReadonlyArray<string>;
  readonly deniedRoots?: ReadonlyArray<string>;
}

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

export interface PiFileToolPathPolicy {
  readonly readableRoots?: ReadonlyArray<string>;
  readonly deniedRoots?: ReadonlyArray<string>;
}

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
 * A file Pi places in the system prompt the way it places `AGENTS.md`.
 */
export interface PiContextFile {
  /**
   * The path Pi names the file by in the system prompt.
   */
  readonly path: string;
  readonly content: string;
}

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
  readonly contextFiles?: ReadonlyArray<PiContextFile>;
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
  readonly suspendToolSettleMs?: number;
  readonly resources?: PiResources;
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
    parked.settings.suspendToolSettleMs ===
      current.settings.suspendToolSettleMs &&
    parked.settings.resources === current.settings.resources
  );
}

interface PiSandboxPaths {
  readonly homeDir: string;
  readonly skillRootDir: string;
  readonly remoteOps: PiRemoteOps;
}

interface PendingToolResult {
  resolve: (value: unknown) => void;
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
 * A host tool call recorded in the restored journal without a matching tool
 * result — it was awaiting host input (typically a tool approval) when the
 * process that owned the live turn went away.
 */
interface DanglingHostToolCall {
  readonly toolCallId: string;
  readonly toolName: string;
}

/**
 * Barrier that holds a cross-process rerun until the framework has
 * re-delivered the results for every journal-pending host tool call.
 */
interface DeferredRerunBarrier {
  /** toolCallId -> toolName still awaiting a submitted result. */
  readonly awaiting: Map<string, string>;
  readonly startRerun: () => void;
  /** Settle the barrier without running: resolves `done` cleanly when no
   * reason is given, rejects it otherwise. No-op once the rerun started. */
  readonly cancel: (reason?: unknown) => void;
}

export async function createPiSession(
  input: CreatePiSessionInput,
): Promise<HarnessV1Session> {
  if (input.isResume) {
    const parked = sessionsParkedOnHostInput.get(input.sessionId);
    if (parked) {
      sessionsParkedOnHostInput.delete(input.sessionId);
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
  let skillsMaterialized = false;
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

  const seededEntries =
    input.resumeEntries && withSessionId(input.resumeEntries, input.sessionId);
  const sessionIdOptions = PI_SESSION_ID_PATTERN.test(input.sessionId)
    ? { id: input.sessionId }
    : {};
  let sessionManager: SessionManager | undefined;
  const getSessionManager = (): SessionManager => {
    sessionManager ??= SessionManager.inMemory(
      sessionWorkDir,
      sessionIdOptions,
      seededEntries == null ? undefined : structuredClone([...seededEntries]),
    );
    return sessionManager;
  };
  const lifecycleData = (): HarnessV1LifecycleState['data'] => {
    const entries =
      sessionManager == null ? seededEntries : sessionEntriesOf(sessionManager);
    return entries == null
      ? {}
      : { entries: secureJsonParse(JSON.stringify(entries)) };
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
  // An untrusted project keeps Pi from reading `.pi/` files under the host
  // path that equals `sessionWorkDir`.
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
  const mcpServers = input.settings.mcpServers ?? {};
  const hasMcpServers = Object.keys(mcpServers).length > 0;

  let sessionInstructions: string | undefined;

  const suspendToolSettleMs = input.settings.suspendToolSettleMs;
  const turnSettle =
    suspendToolSettleMs == null
      ? undefined
      : createPiTurnSettle({ timeoutMs: suspendToolSettleMs });
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
    ...(turnSettle ? [turnSettle.extension] : []),
  ];
  if (hasMcpServers) {
    extensionFactories.push(
      createToolSearchExtension(),
      createMcpExtension({
        loadConfig: () => ({ servers: [], errors: [] }),
        logPath: devNull,
      }),
      pi => {
        for (const [name, config] of Object.entries(mcpServers)) {
          pi.registerMcpServer(name, { exposure: 'direct', ...config });
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
    // the host developer's config and execute their extensions. Project
    // resources come only from `resources` and per-turn harness skills.
    noExtensions: true,
    noThemes: true,
    noPromptTemplates: true,
    noSkills: true,
    noContextFiles: true,
    agentsFilesOverride: () => ({
      agentsFiles: [...(resources.contextFiles ?? [])],
    }),
    skillsOverride: base => ({
      ...base,
      skills: [...configuredSkills, ...harnessSkills],
    }),
  });
  await resourceLoader.reload();

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
  /*
   * Results the framework submitted for journal-pending (dangling) host tool
   * calls while no live turn held a promise for them — the cross-process
   * continuation path. They are written into the restored journal before the
   * rerun (or on suspend/stop, so a later resume still sees them).
   */
  const deliveredDanglingResults = new Map<
    string,
    { toolName: string; output: unknown; isError: boolean }
  >();
  let deferredRerun: DeferredRerunBarrier | undefined;

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
    for (const pending of pendingToolResults.values()) {
      pending.resolve({ error: reason });
    }
    pendingToolResults.clear();
  }

  function settlePendingToolApprovals(reason: string): void {
    for (const pending of pendingToolApprovals.values()) {
      pending.resolve({ approved: false, reason });
    }
    pendingToolApprovals.clear();
  }

  /*
   * Host tool calls in the restored journal that never received a result on
   * the active branch. These are the calls that were blocked on host input
   * (typically a tool approval) when the process owning the live turn exited;
   * the framework re-delivers their results via `submitToolResult` right after
   * `doContinueTurn` returns. Only meaningful before the first rebuild of a
   * resumed session — once a Pi session is live, pending host input is held as
   * in-process promises instead.
   */
  function findDanglingHostToolCalls(
    userTools: ReadonlyArray<HarnessV1ToolSpec>,
  ): DanglingHostToolCall[] {
    if (piSession != null || seededEntries == null) return [];
    const hostToolNames = new Set(userTools.map(tool => tool.name));
    if (hostToolNames.size === 0) return [];
    const messages = getSessionManager().buildSessionContext().messages;
    /*
     * Results already delivered by a previous continuation of this session
     * count as resolved even though they are not in the journal yet — the
     * framework has marked them settled and will never re-deliver them, so a
     * new barrier must not wait on them (it would deadlock the turn). They
     * are injected into the journal before the rerun.
     */
    const resolvedToolCallIds = new Set<string>(
      deliveredDanglingResults.keys(),
    );
    for (const message of messages) {
      if (message.role === 'toolResult') {
        resolvedToolCallIds.add(message.toolCallId);
      }
    }
    const dangling: DanglingHostToolCall[] = [];
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      /*
       * Pi's message transform drops errored/aborted assistant messages from
       * the LLM context entirely, so their tool calls are not awaiting
       * results — the model retries from the last valid state instead.
       */
      if (message.stopReason === 'error' || message.stopReason === 'aborted') {
        continue;
      }
      for (const block of message.content) {
        if (
          block.type === 'toolCall' &&
          hostToolNames.has(block.name) &&
          !resolvedToolCallIds.has(block.id)
        ) {
          dangling.push({ toolCallId: block.id, toolName: block.name });
        }
      }
    }
    return dangling;
  }

  /*
   * A result submitted while no live turn holds a pending promise for its
   * toolCallId. On the cross-process continuation path this is the framework
   * re-delivering the caller's tool-approval/tool-result continuation for a
   * journal-pending call; stash it for injection and release the rerun once
   * every dangling call has its result. Results for ids that are neither live
   * nor journal-pending have nowhere to go and are dropped, as before.
   */
  function acceptDanglingHostToolResult(args: {
    toolCallId: string;
    output: unknown;
    isError?: boolean;
  }): void {
    const barrier = deferredRerun;
    const toolName = barrier?.awaiting.get(args.toolCallId);
    if (barrier == null || toolName == null) return;
    barrier.awaiting.delete(args.toolCallId);
    deliveredDanglingResults.set(args.toolCallId, {
      toolName,
      output: args.output,
      isError: args.isError ?? false,
    });
    if (barrier.awaiting.size === 0) {
      barrier.startRerun();
    }
  }

  /*
   * Write delivered dangling-call results into the restored journal so the
   * rerun's context carries the real outputs — without this, Pi's message
   * transform synthesizes an error result ("No result provided") for each
   * dangling call and the model continues as if the tool never answered. The
   * serialized and truncated text matches what a live turn would have
   * produced, so the model sees the same result either way.
   */
  function appendDeliveredHostToolResults(): boolean {
    if (deliveredDanglingResults.size === 0) return false;
    const journal = getSessionManager();
    for (const [toolCallId, delivered] of deliveredDanglingResults) {
      journal.appendMessage({
        role: 'toolResult',
        toolCallId,
        toolName: delivered.toolName,
        content: [
          {
            type: 'text',
            text: truncatePiToolOutputHead(
              serializeToolOutput(delivered.output),
              'Call the tool again with narrower parameters to inspect the omitted output.',
            ),
          },
        ],
        isError: delivered.isError,
        timestamp: Date.now(),
      });
    }
    deliveredDanglingResults.clear();
    return true;
  }

  /*
   * Cross-process continuation of a turn that paused on host input: the
   * restored journal ends with host tool calls that have no results, and the
   * framework re-delivers those results through `control.submitToolResult`
   * (with the original tool-call ids) immediately after this call returns.
   * Starting the rerun right away would race that delivery — the rerun's
   * context would resolve the dangling calls as synthetic empty results and
   * the submitted outputs would be dropped. Hold the rerun until every
   * dangling call's result has arrived, write the results into the journal,
   * and only then re-drive the turn.
   *
   * If the caller resumes without supplying all continuations, the turn stays
   * parked awaiting the remaining host input — the same behaviour as the
   * in-process path, where the live turn stays blocked on its tool promises.
   */
  function deferRerunUntilHostToolResults(
    danglingCalls: ReadonlyArray<DanglingHostToolCall>,
    continueOpts: HarnessV1ContinueTurnOptions,
  ): HarnessV1PromptControl {
    /*
     * A previous continuation may have ended while its rerun was still held
     * back (e.g. it paused again awaiting a tool-result continuation). Close
     * that turn's control cleanly before installing the new barrier.
     */
    deferredRerun?.cancel();

    let resolveDone!: () => void;
    let rejectDone!: (error: unknown) => void;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    let settled = false;

    const startRerun = () => {
      if (settled) return;
      settled = true;
      deferredRerun = undefined;
      void (async () => {
        try {
          // `runTurn` injects the delivered results into the journal before
          // rebuilding the Pi session from it.
          const control = await runTurn({
            text: '',
            ...(continueOpts.model ? { model: continueOpts.model } : {}),
            skills: continueOpts.skills,
            tools: continueOpts.tools ?? [],
            instructions: continueOpts.instructions,
            emit: continueOpts.emit,
            abortSignal: continueOpts.abortSignal,
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
      deferredRerun = undefined;
      if (reason == null) {
        resolveDone();
      } else {
        rejectDone(reason);
      }
    };

    deferredRerun = {
      awaiting: new Map(
        danglingCalls.map(call => [call.toolCallId, call.toolName]),
      ),
      startRerun,
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
          acceptDanglingHostToolResult(args);
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
        pending.resolve(args.output);
      },
      async submitToolApproval(args) {
        const pending = pendingToolApprovals.get(args.approvalId);
        if (!pending) return;
        pendingToolApprovals.delete(args.approvalId);
        pending.resolve({
          approved: args.approved,
          reason: args.reason,
        });
      },
      async submitUserMessage(text) {
        if (piSession == null) {
          throw new Error('Pi has no active runtime session to steer.');
        }
        await piSession.steer(text);
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
    currentEmit?.({
      type: 'tool-approval-request',
      approvalId: args.toolCallId,
      toolCallId: args.toolCallId,
    });
    if (translatorState) {
      for (const part of finishPiApprovalStep(
        translatorState,
        args.toolCallId,
      )) {
        currentEmit?.(part);
      }
    }
    return new Promise(resolve => {
      pendingToolApprovals.set(args.toolCallId, { resolve });
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
        buildUserToolDefinition(spec, pendingToolResults),
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
      turnSettle?.observe(event);
      for (const part of translatePiEvent(event, translatorState)) {
        if (currentEmit) {
          currentEmit(part);
        } else if (part.type === 'compaction') {
          // No active turn: defer compaction observations to the next turn.
          pendingCompactionParts.push(part);
        }
        // Other event types outside a turn have no consumer and are dropped.
      }
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
    model?: string;
    skills: ReadonlyArray<HarnessV1Skill>;
    tools: ReadonlyArray<HarnessV1ToolSpec>;
    instructions?: string;
    emit: (part: HarnessV1StreamPart) => void;
    abortSignal?: AbortSignal;
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

    if (turnOpts.skills.length > 0 || skillsMaterialized) {
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
      skillsMaterialized = turnOpts.skills.length > 0;
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
         * Any host tool results delivered while no turn was live must land in the
         * journal before the session (re)builds from it, whichever turn entry
         * point runs next. No-op when nothing was delivered.
         */
        const didAppendDeliveredHostToolResults =
          appendDeliveredHostToolResults();

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

        /*
         * A live continuation reports the completed tool execution before the
         * next assistant message, which closes the resumed tool-call step. A
         * journal rerun starts after that result has already been persisted,
         * so Pi has no live tool event to emit. Recreate only the missing step
         * boundary; otherwise the continuation layer mistakes the next
         * assistant response for the resumed step and discards it.
         */
        if (didAppendDeliveredHostToolResults) {
          currentEmit?.({
            type: 'finish-step',
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage: {
              inputTokens: {
                total: 0,
                noCache: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: {
                total: 0,
                text: 0,
                reasoning: 0,
              },
            },
            harnessMetadata: { pi: { inferredStep: true } },
          });
        }

        const session = piSession!;
        const tokensBefore = session.getSessionStats().tokens;
        stage = 'prompting';
        await session.prompt(turnOpts.text);

        const terminalError = turnState.turnError;
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
    sessionsParkedOnHostInput.delete(input.sessionId);
    deferredRerun?.cancel();
    const turnToStop = activeTurn;
    const abortingTurn = turnToStop?.abort();
    settlePendingToolResults('Pi session stopped');
    settlePendingToolApprovals('Pi session stopped');
    await abortingTurn;
    await turnToStop?.done.catch(() => {});

    /*
     * Results the framework already delivered for journal-pending calls must
     * reach the journal before it is persisted — the framework has marked
     * them settled and will not re-deliver them on a later resume.
     */
    appendDeliveredHostToolResults();
    const data = lifecycleData();

    await disposePiSession({ reason: 'quit' });
    await rm(hostRoot, { recursive: true, force: true });

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
      return runTurn({
        text: extractUserText(promptOpts.prompt),
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

      /*
       * The restored journal ends with host tool calls that never got their
       * results — the turn was paused on host input (e.g. a tool approval)
       * when the previous process exited. The framework re-delivers those
       * results via `submitToolResult` right after this call returns; hold
       * the rerun until they have all arrived so they reach the model.
       */
      const danglingHostToolCalls = findDanglingHostToolCalls(
        continueOpts.tools ?? [],
      );
      if (danglingHostToolCalls.length > 0) {
        return deferRerunUntilHostToolResults(
          danglingHostToolCalls,
          continueOpts,
        );
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
      sessionsParkedOnHostInput.delete(input.sessionId);
      deferredRerun?.cancel();
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
        sessionsParkedOnHostInput.set(input.sessionId, {
          session: sessionImpl,
          input,
          stateType: 'resume-session',
        });
        return {
          type: 'resume-session',
          harnessId: HARNESS_ID,
          specificationVersion: 'harness-v1',
          data: lifecycleData(),
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
        sessionsParkedOnHostInput.set(input.sessionId, {
          session: sessionImpl,
          input,
          stateType: 'continue-turn',
        });
        return {
          type: 'continue-turn',
          harnessId: HARNESS_ID,
          specificationVersion: 'harness-v1',
          data: lifecycleData(),
        };
      }
      suspending = true;
      const turnToSuspend = activeTurn;
      deferredRerun?.cancel();
      settlePendingToolResults('Pi session suspended');
      settlePendingToolApprovals('Pi session suspended');
      if (turnToSuspend != null) await turnSettle?.settle();
      await turnToSuspend?.abort();
      await turnToSuspend?.done.catch(() => {});

      /*
       * A suspend can land while the rerun is still held back waiting for
       * host tool results. Whatever the framework already delivered must land
       * in the journal now — it will not be re-delivered — while calls still
       * awaiting results stay dangling for the next continuation to collect.
       */
      appendDeliveredHostToolResults();
      const data = lifecycleData();

      stopped = true;
      sessionsParkedOnHostInput.delete(input.sessionId);
      await disposePiSession({ reason: 'quit' });
      await rm(hostRoot, { recursive: true, force: true });

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
    details: undefined,
  };
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
  const approvedOps = async (
    toolCallId: string,
  ): Promise<{ ops: PiRemoteOps } | { denied: AgentToolResult<unknown> }> => {
    const decision = await input.requestApproval({
      toolCallId,
      nativeName: input.native,
    });
    if (!decision.approved) {
      return {
        denied: asPiToolResult(
          serializeToolOutput({
            type: 'execution-denied',
            reason: decision.reason,
          }),
        ),
      };
    }
    return { ops: await input.remoteOps() };
  };
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
          const approval = await approvedOps(toolCallId);
          if ('denied' in approval) return approval.denied;
          const { ops } = approval;
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
          const approval = await approvedOps(toolCallId);
          if ('denied' in approval) return approval.denied;
          const { ops } = approval;
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
          const approval = await approvedOps(toolCallId);
          if ('denied' in approval) return approval.denied;
          const { ops } = approval;
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
          const approval = await approvedOps(toolCallId);
          if ('denied' in approval) return approval.denied;
          const { ops } = approval;
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
          const approval = await approvedOps(toolCallId);
          if ('denied' in approval) return approval.denied;
          const { ops } = approval;
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
          const approval = await approvedOps(toolCallId);
          if ('denied' in approval) return approval.denied;
          const { ops } = approval;
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
          const approval = await approvedOps(toolCallId);
          if ('denied' in approval) return approval.denied;
          const { ops } = approval;
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

function buildUserToolDefinition(
  spec: HarnessV1ToolSpec,
  pending: Map<string, PendingToolResult>,
): ToolDefinition {
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
      return new Promise<unknown>(resolve => {
        pending.set(toolCallId, { resolve });
      }).then(output =>
        asPiToolResult(
          truncatePiToolOutputHead(
            serializeToolOutput(output),
            'Call the tool again with narrower parameters to inspect the omitted output.',
          ),
        ),
      );
    },
  });
}
