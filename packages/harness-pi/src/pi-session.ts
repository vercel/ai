import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentToolResult,
  type ExtensionFactory,
  type ProviderConfig,
  type Skill,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import {
  createPiModelRuntime,
  registerPiProviders,
  resolvePiEnv,
  type PiAuthenticationMode,
  type PiCredentialStore,
} from './pi-auth';
import { resolvePiSubscriptionAgentDir } from './pi-subscription';
import {
  getPiTerminalError,
  parseNativeEvent,
  type PiSessionEvent,
} from './pi-events';
import { createPiModelResolver } from './pi-model-resolver';
import { createPiPathMapper } from './pi-paths';
import {
  createPiRemoteOps,
  resolvePiSandboxPathOrParent,
  type PiRemoteOps,
} from './pi-remote-ops';
import {
  formatPiReadToolOutput,
  truncatePiToolOutputHead,
  truncatePiToolOutputTail,
} from './pi-tool-result';

import {
  persistSessionFileToSandbox,
  pullSessionFileFromSandbox,
  resolvePiPrivateSessionDirectory,
  safePiSessionFileName,
  type PiCompletedToolResult,
  type PiPendingToolBatch,
} from './pi-resume-state';
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
  extractUserText,
  safePiMetadataSegment,
  serializeToolOutput,
} from './pi-utils';
import { PiWorkspaceVfs } from './pi-workspace-vfs';
import { syncHostWorkspaceFromSandbox } from './pi-workspace-mirror';

const HARNESS_ID = 'pi';

/*
 * pi-mcp-adapter publishes TypeScript source as its package entry point. A
 * non-literal specifier keeps the repository type-check focused on this
 * package's compatibility boundary instead of compiling dependency internals.
 */
const PI_MCP_ADAPTER_PACKAGE: string = 'pi-mcp-adapter';

type PiMcpAdapterModule = {
  createMcpAdapter(options: {
    config: {
      mcpServers: Record<string, unknown>;
      settings: {
        directTools: boolean;
        toolPrefix: string;
        disableProxyTool: boolean;
        outputGuard?: boolean;
      };
    };
  }): ExtensionFactory;
};

/*
 * Pi runs in this Node process, not behind an attachable in-sandbox bridge.
 * During a tool approval pause the Pi turn is still alive and blocked on the
 * custom tool promise, so in-process reattachment parks that live session for
 * the next same-process resume instead of stopping it and resolving the
 * promise as an error. Cross-process resume still falls back to the persisted
 * session file.
 */
const parkedPiSessions = new Map<
  string,
  {
    session: HarnessV1Session;
    input: CreatePiSessionInput;
    stateType: 'continue-turn' | 'resume-session';
  }
>();

/**
 * Whether a discovered resource path belongs to a specific directory.
 */
function isWithinDirectory(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Whether a discovered resource path belongs to the session workspace — either
 * the sandbox-side working directory the model sees (`sessionWorkDir`) or its
 * host-side mirror (`hostWorkDir`).
 */
function isWithinWorkspace(
  candidate: string,
  sessionWorkDir: string,
  hostWorkDir: string,
): boolean {
  return (
    isWithinDirectory(sessionWorkDir, candidate) ||
    isWithinDirectory(hostWorkDir, candidate)
  );
}

function createHarnessPiSkills({
  skills,
  sandboxSkillRootDir,
}: {
  skills: ReadonlyArray<HarnessV1Skill>;
  sandboxSkillRootDir: string;
}): Skill[] {
  return skills.map(skill => {
    const name = safePiMetadataSegment(skill.name, 'skill');
    const baseDir = path.posix.join(sandboxSkillRootDir, name);
    const filePath = path.posix.join(baseDir, 'SKILL.md');
    return {
      name: skill.name,
      description: skill.description,
      filePath,
      baseDir,
      sourceInfo: {
        path: filePath,
        source: 'harness',
        scope: 'temporary',
        origin: 'top-level',
        baseDir,
      },
      disableModelInvocation: false,
    };
  });
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

export interface PiMcpSettings {
  /**
   * How MCP tool names are prefixed: `mcp` (`mcp__<server>_<tool>`), `server`
   * (`<server>_<tool>`), `short` (the server name without an `mcp` suffix), or
   * `none` (the bare tool name). Only `mcp`-prefixed tool calls are reported
   * as provider-executed dynamic tools with parsed JSON results.
   *
   * @default 'mcp'
   */
  readonly toolPrefix?: 'server' | 'none' | 'short' | 'mcp';
  /**
   * Whether the MCP adapter truncates large tool results and writes the full
   * text to a file in the host temp directory.
   *
   * @default true
   */
  readonly outputGuard?: boolean;
}

export type PiCacheRetention = 'none' | 'short' | 'long';

export interface PiFileToolPathPolicy {
  readonly readableRoots?: ReadonlyArray<string>;
  readonly deniedRoots?: ReadonlyArray<string>;
}

export interface PiSessionSettings {
  readonly auth?: PiAuthenticationMode;
  readonly credentials?: PiCredentialStore;
  readonly reattachInProcess?: boolean;
  readonly headers?: Readonly<Record<string, string>>;
  readonly thinkingLevel?: PiThinkingLevel;
  readonly cacheRetention?: PiCacheRetention;
  readonly mcpServers?: Record<string, unknown>;
  readonly mcpSettings?: PiMcpSettings;
  readonly providers?: Readonly<Record<string, ProviderConfig>>;
  readonly extensionFactories?: ReadonlyArray<ExtensionFactory>;
  readonly fileToolPathPolicy?: PiFileToolPathPolicy;
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
  readonly resumeSessionFileName?: string;
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
    parked.settings.fileToolPathPolicy === current.settings.fileToolPathPolicy
  );
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
 * Holds a cross-process continuation until the framework has delivered the
 * host input (tool results, built-in approval decisions) for every call of
 * the persisted tool batch, then replays the batch.
 */
interface ToolBatchReplayBarrier {
  readonly awaiting: Set<string>;
  readonly deliveredHostResults: Map<
    string,
    { output: unknown; isError: boolean }
  >;
  readonly toCheckpoint: () => PiPendingToolBatch;
  readonly start: () => void;
  /** Settle the barrier without replaying: resolves `done` cleanly when no
   * reason is given, rejects it otherwise. No-op once the replay started. */
  readonly cancel: (reason?: unknown) => void;
}

interface PiToolBatchReplay {
  readonly toolResults: Map<string, PiCompletedToolResult>;
  readonly suppressedToolCallIds: Set<string>;
  readonly hostToolResults: Map<string, { output: unknown; isError: boolean }>;
}

async function isWorkspaceAvailableOnHost({
  sandbox,
  sessionWorkDir,
}: {
  sandbox: SandboxSession;
  sessionWorkDir: string;
}): Promise<boolean> {
  // A host path existing at the same location is not enough to prove that it
  // belongs to the sandbox. Round-trip a unique marker through the sandbox
  // filesystem API before using the workspace directly.
  const probePath = path.join(
    sessionWorkDir,
    `.ai-sdk-harness-pi-${randomUUID()}`,
  );
  const probeContent = randomUUID();

  try {
    await writeFile(probePath, probeContent, { flag: 'wx' });
    const sandboxContent = await sandbox.readBinaryFile({ path: probePath });
    return (
      sandboxContent != null &&
      Buffer.from(sandboxContent).equals(Buffer.from(probeContent))
    );
  } catch {
    return false;
  } finally {
    await rm(probePath, { force: true }).catch(() => {});
  }
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

  // Host-side mirror layout under tmpdir. Replace path-separator characters
  // that would otherwise turn a session id like `2026-05-29T17:54:27` into a
  // sub-directory tree on disk.
  const safeSessionId = input.sessionId.replace(/[\\/: ]/g, '-');
  const hostRoot = path.join(tmpdir(), 'ai-sdk-harness', 'pi', safeSessionId);
  const hostAgentDir = path.join(hostRoot, 'agent');
  const hostSessionDir = path.join(hostRoot, 'sessions');
  const toolSafeSandboxSession = getRestrictedSandboxSession(
    input.sandboxSession,
  );
  const fileToolPathPolicy = input.settings.fileToolPathPolicy;
  const canonicalDeniedRoots: string[] = [];
  for (const deniedRoot of fileToolPathPolicy?.deniedRoots ?? []) {
    canonicalDeniedRoots.push(
      await resolvePiSandboxPathOrParent({
        sandbox: toolSafeSandboxSession,
        remotePath: path.posix.normalize(deniedRoot),
        inputPath: deniedRoot,
      }),
    );
  }

  // Pi runs in this host process but must behave as though it lives in the
  // sandbox workspace: its working directory is the real `sessionWorkDir`
  // (where `setup()` clones and where the sandbox-backed tools operate), so the
  // paths Pi advertises to the model — most notably the "Current working
  // directory" line in its system prompt — resolve inside the sandbox. When
  // the sandbox filesystem is remote, the workspace VFS maps that sandbox path
  // to a scoped host mirror for Pi's own `fs`-based resource loading. When the
  // sandbox and harness share a filesystem, Pi uses the workspace directly so
  // extensions can inspect project files beyond the scoped resource paths.
  const sessionWorkDir = input.sessionWorkDir;
  const workspaceAvailableOnHost = await isWorkspaceAvailableOnHost({
    sandbox: toolSafeSandboxSession,
    sessionWorkDir,
  });
  const hostWorkDir = workspaceAvailableOnHost
    ? path.resolve(sessionWorkDir)
    : path.join(hostRoot, 'workspace');

  await mkdir(hostWorkDir, { recursive: true });
  await mkdir(hostAgentDir, { recursive: true });
  await mkdir(hostSessionDir, { recursive: true });

  const sandboxHomeDir = await resolveSandboxHomeDir({
    sandbox: toolSafeSandboxSession,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
  const privateSessionDir = resolvePiPrivateSessionDirectory({
    sandboxHomeDir,
    sessionWorkDir: input.sessionWorkDir,
    sessionId: input.sessionId,
  });
  const permissionMode = input.permissionMode ?? 'allow-all';
  const activeBuiltinNames = resolveActivePiBuiltinNames(
    input.builtinToolFiltering,
  );
  const activeNativeToCommon = Object.fromEntries(
    Object.entries(NATIVE_TO_COMMON).filter(([native]) =>
      activeBuiltinNames.some(name => name === native),
    ),
  );
  const sandboxSkillRootDir = path.posix.join(
    sandboxHomeDir,
    '.agents',
    'skills',
  );
  let harnessSkills: Skill[] = [];

  // On resume: pull the Pi session file out of the sandbox into the fresh
  // host mirror so SessionManager.open can read it.
  let resumeSessionFilePath: string | undefined;
  if (input.isResume && input.resumeSessionFileName) {
    const resumeSessionFileName = safePiSessionFileName(
      input.resumeSessionFileName,
    );
    resumeSessionFilePath = await pullSessionFileFromSandbox({
      sandbox: toolSafeSandboxSession,
      privateSessionDir,
      hostSessionDir,
      sessionFileName: resumeSessionFileName,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
  }

  // Snapshot sandbox state into the host mirror BEFORE the VFS goes live so
  // Pi sees the workspace as soon as it boots.
  if (!workspaceAvailableOnHost) {
    await syncHostWorkspaceFromSandbox({
      sandbox: toolSafeSandboxSession,
      sandboxWorkDir: input.sessionWorkDir,
      hostWorkDir,
    });
  }

  // Mount only the workspace: the model's view of the workspace lives at
  // `sessionWorkDir` and is backed by `hostWorkDir`. The agent and session
  // directories stay on the real host filesystem (below) — they are host-only
  // Pi state (auth, model registry, session journal) that must never surface
  // in the sandbox or the workspace mirror.
  const workspaceVfs = new PiWorkspaceVfs();
  if (!workspaceAvailableOnHost) {
    workspaceVfs.mount(hostWorkDir, sessionWorkDir);
  }

  const paths = createPiPathMapper({
    hostWorkDir,
    sandboxWorkDir: sessionWorkDir,
    readableRoots: [
      { sandboxDir: sandboxSkillRootDir },
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
    ...(fileToolPathPolicy ? { homeDir: sandboxHomeDir } : {}),
  });

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
  const settingsManager =
    input.agentDir != null
      ? SettingsManager.create(hostWorkDir, agentDir)
      : SettingsManager.inMemory();

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
  const mcpServers = resolvePiMcpServers({
    mcpServers: input.settings.mcpServers,
  });
  const hasMcpServers = Object.keys(mcpServers).length > 0;

  let sessionInstructions: string | undefined;

  /*
   * Configured MCP servers are served by an inline Pi extension, so they share
   * the extension runtime with the caller-supplied factories: both are loaded
   * by the resource loader below and both are subject to the reload handling
   * that keeps the active runtime alive across resource-only reloads.
   */
  const extensionFactories: ExtensionFactory[] = [
    ...(input.settings.extensionFactories ?? []),
  ];
  if (hasMcpServers) {
    const { createMcpAdapter } = (await import(
      PI_MCP_ADAPTER_PACKAGE
    )) as PiMcpAdapterModule;
    extensionFactories.push(
      createMcpAdapter({
        config: {
          mcpServers,
          settings: {
            directTools: true,
            toolPrefix: 'mcp',
            disableProxyTool: true,
            ...input.settings.mcpSettings,
          },
        },
      }),
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
    // Pi runs in the host process, so its default resource discovery reaches
    // the host developer's personal config (`~/.pi/agent/*`, `~/.agents/*`).
    // The harness exposes only explicitly supplied inline extension factories;
    // disable filesystem extension discovery entirely to avoid loading and
    // executing a host developer's personal or project Pi extensions inside
    // the server process. Themes and prompt templates stay disabled. Skills
    // are kept but filtered to workspace project skills plus harness-provided
    // skills whose files live in sandbox HOME.
    noExtensions: true,
    noThemes: true,
    noPromptTemplates: true,
    skillsOverride: base => ({
      ...base,
      skills: [
        ...base.skills.filter(skill =>
          isWithinWorkspace(skill.filePath, sessionWorkDir, hostWorkDir),
        ),
        ...harnessSkills,
      ],
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
  let sessionFileName: string | undefined =
    resumeSessionFilePath == null
      ? undefined
      : safePiSessionFileName(path.basename(resumeSessionFilePath));
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
  let restoredSessionManager:
    | ReturnType<typeof SessionManager.open>
    | undefined;
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
   * The current assistant message's tool batch. Parallel batches only write
   * their tool results to the journal after every call finished, so results
   * of calls that already finished are kept here for checkpoints.
   */
  let currentToolBatch:
    | {
        readonly completed: Map<string, PiCompletedToolResult>;
        readonly journaled: Set<string>;
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

  const remoteOps = createPiRemoteOps({
    sandbox: toolSafeSandboxSession,
    paths,
    onFileChange: (event, relPath) => {
      currentEmit?.({ type: 'file-change', event, path: relPath });
    },
  });

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

  async function persistSessionFile(): Promise<void> {
    if (!sessionFileName) return;
    await persistSessionFileToSandbox({
      sandbox: toolSafeSandboxSession,
      privateSessionDir,
      hostSessionDir,
      sessionFileName,
    });
  }

  function getRestoredSessionManager():
    | ReturnType<typeof SessionManager.open>
    | undefined {
    if (resumeSessionFilePath == null) return undefined;
    restoredSessionManager ??= SessionManager.open(
      resumeSessionFilePath,
      hostSessionDir,
      sessionWorkDir,
    );
    return restoredSessionManager;
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
      currentToolBatch =
        toolNames.length > 0
          ? { completed: new Map(), journaled: new Set() }
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
    if (event.type === 'message_end' && message?.role === 'toolResult') {
      if (typeof message.toolCallId === 'string') {
        currentToolBatch?.journaled.add(message.toolCallId);
      }
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
      awaitingToolCallIds,
      completedToolResults: [...batch.completed.values()].filter(
        result =>
          !batch.journaled.has(result.toolCallId) &&
          !awaitingToolCallIds.includes(result.toolCallId),
      ),
      nativeApprovalDecisions: [],
    };
  }

  function createLifecycleData(
    pendingToolBatch: PiPendingToolBatch | undefined,
  ): HarnessV1ResumeSessionState['data'] {
    return {
      ...(sessionFileName ? { sessionFileName } : {}),
      ...(pendingToolBatch ? { pendingToolBatch } : {}),
    } as HarnessV1ResumeSessionState['data'];
  }

  function acceptReplayToolResult(args: {
    toolCallId: string;
    output: unknown;
    isError?: boolean;
  }): void {
    const barrier = replayBarrier;
    if (barrier == null || !barrier.awaiting.has(args.toolCallId)) return;
    barrier.awaiting.delete(args.toolCallId);
    barrier.deliveredHostResults.set(args.toolCallId, {
      output: args.output,
      isError: args.isError ?? false,
    });
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
    const deliveredHostResults = new Map<
      string,
      { output: unknown; isError: boolean }
    >();
    const deliveredToolResults = (): PiCompletedToolResult[] =>
      [...deliveredHostResults].map(([toolCallId, delivered]) => ({
        toolCallId,
        result: toPiHostToolResult(
          delivered.output,
        ) as unknown as PiCompletedToolResult['result'],
        isError: delivered.isError,
      }));

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
            ...(continueOpts.model ? { model: continueOpts.model } : {}),
            skills: continueOpts.skills,
            tools: continueOpts.tools ?? [],
            instructions: continueOpts.instructions,
            emit: continueOpts.emit,
            abortSignal: continueOpts.abortSignal,
            replay: {
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
        pending.resolve(args.output);
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
          remoteOps,
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
    isFirstBuild: boolean,
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

    // SessionManager: open the resumed file on the first build of a resumed
    // session; create fresh otherwise.
    const sessionManager =
      isFirstBuild && resumeSessionFilePath
        ? getRestoredSessionManager()!
        : SessionManager.create(sessionWorkDir, hostSessionDir);

    const { session } = await createAgentSession({
      cwd: sessionWorkDir,
      agentDir: hostAgentDir,
      modelRuntime,
      sessionManager,
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

    // Pick up the actual session file path so doStop can persist it. Pi
    // 0.77 emits `.jsonl` files; older builds used `.json`. Persist the
    // basename verbatim — including the extension — so the resume path can
    // round-trip it without guessing the extension.
    const candidatePath = sessionManager.getSessionFile();
    if (candidatePath) {
      sessionFileName = safePiSessionFileName(path.basename(candidatePath));
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

    const skillWriteResult = await writeSkills({
      sandbox: toolSafeSandboxSession,
      homePath: sandboxHomeDir,
      skillsDir: '.agents/skills',
      skills: turnOpts.skills,
      abortSignal: turnOpts.abortSignal,
      invalidSkillNameMessage: ({ name }) => `Invalid Pi skill name: ${name}`,
      invalidSkillFilePathMessage: ({ skillName, filePath }) =>
        `Invalid Pi skill file path for ${skillName}: ${filePath}`,
    });
    harnessSkills = createHarnessPiSkills({
      skills: turnOpts.skills,
      sandboxSkillRootDir,
    });
    if (piSession != null && skillWriteResult.changed) {
      await reloadResourcesOnly();
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
      try {
        await applySessionInstructions(turnOpts.instructions);
        turnAbortController.signal.throwIfAborted();

        /*
         * The restored journal must be moved back to before the tool batch
         * before the Pi session builds its transcript from it.
         */
        const restoredJournal =
          turnOpts.replay != null && piSession == null
            ? getRestoredSessionManager()
            : undefined;
        const replayBatch =
          restoredJournal == null
            ? undefined
            : takeToolBatchForReplay({ journal: restoredJournal });
        const replayToolResults = new Map(turnOpts.replay?.toolResults);
        const replaySuppressed = new Set(
          turnOpts.replay?.suppressedToolCallIds,
        );
        for (const result of replayBatch?.journaledToolResults ?? []) {
          if (!replayToolResults.has(result.toolCallId)) {
            replayToolResults.set(result.toolCallId, result);
            replaySuppressed.add(result.toolCallId);
          }
        }

        if (nextModel != null) activeResolvedModel = nextModel;

        const signature = JSON.stringify(userTools.map(t => t.name).sort());
        const needsRebuild =
          piSession == null || signature !== lastToolsSignature;
        let resourcesReloaded = false;
        if (needsRebuild) {
          resourcesReloaded = await rebuildPiSession(
            userTools,
            piSession == null,
          );
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
        if (!workspaceAvailableOnHost) {
          await syncHostWorkspaceFromSandbox({
            sandbox: toolSafeSandboxSession,
            sandboxWorkDir: input.sessionWorkDir,
            hostWorkDir,
          });
        }
        turnAbortController.signal.throwIfAborted();

        // Fresh translator state for the new turn — keep the tool sets the
        // session was built with.
        translatorState = createPiTranslatorState({
          builtinToolNames: activeBuiltinNames,
          hostToolNames: userTools.map(tool => tool.name),
          nativeToCommon: activeNativeToCommon,
        });

        currentEmit?.({
          type: 'stream-start',
          ...(piSession?.model?.id ? { modelId: piSession.model.id } : {}),
        });

        for (const [toolCallId, delivered] of turnOpts.replay
          ?.hostToolResults ?? []) {
          translatorState.hostToolResults.set(toolCallId, delivered.output);
        }

        let terminalError: string | undefined;
        const session = piSession!;

        // We subscribed in rebuild, but the translator may need to detect
        // terminal errors too — wrap a second listener that records them.
        const unsubErr = session.subscribe(raw => {
          const ev = parseNativeEvent(raw);
          if (!ev) return;
          const err = getPiTerminalError(ev);
          if (err && !terminalError) {
            terminalError = err;
          }
        });

        const tokensBefore = session.getSessionStats().tokens;
        try {
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
            await session.prompt(turnOpts.text);
          }

          if (terminalError) {
            /*
             * A `doSuspendTurn` aborts the in-flight turn on purpose. Pi surfaces
             * that abort as a *resolved* prompt with a recorded terminal error
             * ("This operation was aborted") rather than a thrown exception, so the
             * `catch` guard below never sees it. Swallow it here too — but only if
             * it's actually the abort: the stream then closes cleanly (no spurious
             * `error` chunk) and the next slice rerun-continues from the journal.
             * Any other terminal error mid-suspend is unanticipated and must
             * surface.
             */
            if (suspending && isAbortError(terminalError)) return;
            currentEmit?.({ type: 'error', error: new Error(terminalError) });
            return;
          }

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
              reasoning: translatorState?.turnReasoningTokens,
            }),
          });
        } catch (err) {
          // A `doSuspendTurn` aborts the in-flight turn on purpose — settle silently
          // so the stream closes cleanly without a spurious `error` chunk; the
          // next slice rerun-continues from the persisted journal.
          // Same rule as the resolved-with-terminalError path: only swallow the
          // abort our own suspend caused; surface anything unanticipated.
          if (suspending && isAbortError(err)) return;
          currentEmit?.({ type: 'error', error: err });
        } finally {
          unsubErr();
        }
      } catch (err) {
        if (suspending && isAbortError(err)) return;
        throw err;
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
    if (pendingToolBatch != null && sessionFileName) {
      try {
        await persistSessionFile();
      } catch {
        // Best-effort, like the regular persistence below.
      }
    }
    const turnToStop = activeTurn;
    const abortingTurn = turnToStop?.abort();
    settlePendingToolResults('Pi session stopped');
    settlePendingToolApprovals('Pi session stopped');
    await abortingTurn;
    await turnToStop?.done.catch(() => {});

    // Persist the Pi session file into the sandbox so a future process
    // can pick it up after `provider.resumeSession({ sessionId })` reattaches.
    if (sessionFileName && pendingToolBatch == null) {
      try {
        await persistSessionFile();
      } catch {
        // Best-effort: a missing session file means resume returns to a
        // fresh conversation rather than failing stop.
      }
    }

    await disposePiSession({ reason: 'quit' });
    workspaceVfs.unmount();
    await rm(hostRoot, { recursive: true, force: true });

    return {
      type: 'resume-session',
      harnessId: HARNESS_ID,
      specificationVersion: 'harness-v1',
      data: createLifecycleData(pendingToolBatch),
    };
  };

  const sessionImpl: HarnessV1Session = {
    sessionId: input.sessionId,
    isResume: input.isResume,
    // Pi has no bridge to attach to and no on-disk event log to replay; its
    // only resume path is restoring the session file on a fresh/snapshotted
    // sandbox, i.e. `rerun`.

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
        await rebuildPiSession([], true);
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
      workspaceVfs.unmount();
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
        if (sessionFileName) {
          try {
            await persistSessionFile();
          } catch {
            /*
             * The parked in-process session is the authoritative continuation
             * path while the live turn is waiting on host input. Persistence is
             * only a fallback for later non-live resumes.
             */
          }
        }
        return {
          type: 'resume-session',
          harnessId: HARNESS_ID,
          specificationVersion: 'harness-v1',
          data: createLifecycleData(pendingToolBatch),
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
        if (sessionFileName) {
          try {
            await persistSessionFile();
          } catch {
            /*
             * While waiting on host input, the live parked session is the
             * authoritative same-process continuation path. The sandbox copy
             * remains a best-effort fallback for a later cold resume.
             */
          }
        }
        return {
          type: 'continue-turn',
          harnessId: HARNESS_ID,
          specificationVersion: 'harness-v1',
          data: createLifecycleData(pendingToolBatch),
        };
      }
      /*
       * Pi's model runs in this host process, which is about to be suspended at
       * the slice boundary — the in-flight turn cannot survive it. Abort it (the
       * turn settles silently via the `suspending` guard so the stream closes
       * cleanly), persist the journal into the sandbox, and tear down host-side
       * resources. The sandbox itself is left running; the next slice pulls the
       * journal after `provider.resumeSession({ sessionId })` and rerun-continues. The
       * tail in flight at the boundary is recomputed — Pi cannot freeze a live
       * turn the way a bridge adapter can.
       */
      /*
       * Same as `doStop`: checkpoint a tool batch waiting on host input
       * before the abort settles its calls with errors.
       */
      const pendingToolBatch = createPendingToolBatchCheckpoint();
      replayBarrier?.cancel();
      if (pendingToolBatch != null && sessionFileName) {
        try {
          await persistSessionFile();
        } catch {
          // Best-effort, like the regular persistence below.
        }
      }
      suspending = true;
      const turnToSuspend = activeTurn;
      const abortingTurn = turnToSuspend?.abort();
      settlePendingToolResults('Pi session suspended');
      settlePendingToolApprovals('Pi session suspended');
      await abortingTurn;
      await turnToSuspend?.done.catch(() => {});

      if (sessionFileName && pendingToolBatch == null) {
        try {
          await persistSessionFile();
        } catch {
          // Best-effort: a missing/failed copy leaves the previously persisted
          // journal in place, so the next slice resumes from a slightly older
          // (still valid) state.
        }
      }

      stopped = true;
      parkedPiSessions.delete(input.sessionId);
      await disposePiSession({ reason: 'quit' });
      workspaceVfs.unmount();
      await rm(hostRoot, { recursive: true, force: true });

      return {
        type: 'continue-turn',
        harnessId: HARNESS_ID,
        specificationVersion: 'harness-v1',
        data: createLifecycleData(pendingToolBatch),
      };
    },
  };

  return sessionImpl;
}

function resolvePiMcpServers({
  mcpServers,
}: {
  mcpServers: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  if (mcpServers == null) return {};
  for (const [name, value] of Object.entries(mcpServers)) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(
        `Pi MCP server ${JSON.stringify(name)} must be configured with an object value.`,
      );
    }
  }
  return mcpServers;
}

/**
 * Whether a terminal error (string from Pi's event stream, or a thrown error)
 * is an abort — the expected result of `doSuspendTurn` aborting the in-flight
 * turn. Only these are safe to swallow while `suspending`; any other error is
 * unanticipated and must surface as an `error` chunk.
 */
function isAbortError(value: unknown): boolean {
  if (value == null) return false;
  if (
    typeof value === 'object' &&
    (value as { name?: unknown }).name === 'AbortError'
  ) {
    return true;
  }
  const text =
    typeof value === 'string'
      ? value
      : value instanceof Error
        ? value.message
        : String(value);
  return /\baborted\b|AbortError|operation was aborted/i.test(text);
}

function asPiToolResult(text: string): AgentToolResult<unknown> {
  return {
    content: [{ type: 'text', text }],
    details: undefined,
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
  remoteOps: PiRemoteOps;
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
        description:
          'Read file contents. Output is limited to 2,000 lines or 50KB. Use offset and limit to read large files in pages.',
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
        async execute(toolCallId, params) {
          const denied = await maybeDenyPiBuiltinTool({
            toolCallId,
            nativeName: 'read',
            requestApproval: input.requestApproval,
          });
          if (denied) return denied;
          const buf = await input.remoteOps.readBuffer(params.file_path);
          return asPiToolResult(
            formatPiReadToolOutput({
              text: buf.toString('utf8'),
              filePath: params.file_path,
              offset: params.offset,
              limit: params.limit,
            }),
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
          await input.remoteOps.writeFile(params.file_path, params.content);
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
          await input.remoteOps.editFile(
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
          const chunks: Buffer[] = [];
          const result = await input.remoteOps.exec(params.command, '.', {
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
          const out = await input.remoteOps.grepFiles(params.pattern, params);
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
          const matches = await input.remoteOps.findFiles(
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
          const entries = await input.remoteOps.listDirectory(
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

function toPiHostToolResult(output: unknown): AgentToolResult<unknown> {
  return asPiToolResult(
    truncatePiToolOutputHead(
      serializeToolOutput(output),
      'Call the tool again with narrower parameters to inspect the omitted output.',
    ),
  );
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
      return new Promise<unknown>(resolve => {
        pending.set(toolCallId, { resolve });
        onPending();
      }).then(toPiHostToolResult);
    },
  });
}
