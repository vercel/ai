import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentToolResult,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Type } from 'typebox';
import type {
  HarnessV1PromptControl,
  HarnessV1PromptOptions,
  HarnessV1ResumeState,
  HarnessV1SandboxHandle,
  HarnessV1Session,
  HarnessV1Skill,
  HarnessV1StreamPart,
  HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import { resolvePiAuth, type PiAuthOptions } from './pi-auth';
import { getPiTerminalError, parseNativeEvent } from './pi-events';
import { createPiModelResolver } from './pi-model-resolver';
import { createPiPathMapper } from './pi-paths';
import { createPiRemoteOps, type PiRemoteOps } from './pi-remote-ops';
import { writePiSkills } from './pi-skills';
import {
  persistSessionFileToSandbox,
  pullSessionFileFromSandbox,
} from './pi-resume-state';
import {
  createPiTranslatorState,
  translatePiEvent,
  type PiTranslatorState,
} from './pi-translate';
import { toolSpecToTypeBoxParameters } from './pi-typebox-adapter';
import { extractUserText, serializeToolOutput } from './pi-utils';
import { PiWorkspaceVfs } from './pi-workspace-vfs';
import { syncLocalWorkspaceFromSandbox } from './pi-workspace-mirror';

const PI_VFS_ROOT = path.join(path.sep, 'vfs', 'pi');
const HARNESS_ID = 'pi';

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

export type PiThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

export interface PiSessionSettings {
  readonly auth?: PiAuthOptions;
  readonly model?: string;
  readonly thinkingLevel?: PiThinkingLevel;
}

export interface CreatePiSessionInput {
  readonly sessionId: string;
  readonly sandboxHandle: HarnessV1SandboxHandle;
  readonly sessionWorkDir: string;
  readonly skills: ReadonlyArray<HarnessV1Skill>;
  readonly settings: PiSessionSettings;
  readonly isResume: boolean;
  readonly resumeSessionFileName?: string;
  readonly abortSignal?: AbortSignal;
}

interface PendingToolResult {
  resolve: (value: unknown) => void;
}

export async function createPiSession(
  input: CreatePiSessionInput,
): Promise<HarnessV1Session> {
  // Local mirror layout under tmpdir. Replace path-separator characters that
  // would otherwise turn a session id like `2026-05-29T17:54:27` into a
  // sub-directory tree on disk.
  const safeSessionId = input.sessionId.replace(/[\\/: ]/g, '-');
  const localRoot = path.join(tmpdir(), 'ai-sdk-harness', 'pi', safeSessionId);
  const localWorkDir = path.join(localRoot, 'workspace');
  const localAgentDir = path.join(localRoot, 'agent');
  const localSessionDir = path.join(localRoot, 'sessions');

  const logicalRoot = path.join(PI_VFS_ROOT, safeSessionId);
  const logicalWorkDir = path.posix.join(logicalRoot, 'workspace');
  const logicalAgentDir = path.posix.join(logicalRoot, 'agent');
  const logicalSessionDir = path.posix.join(logicalRoot, 'sessions');

  await mkdir(localWorkDir, { recursive: true });
  await mkdir(localAgentDir, { recursive: true });
  await mkdir(localSessionDir, { recursive: true });

  const sandbox = input.sandboxHandle.session;

  // Materialise skills into the sandbox workspace once. The host's VFS will
  // make them visible to Pi's `DefaultResourceLoader` after mount + sync.
  if (input.skills.length > 0) {
    await writePiSkills({
      sandbox,
      sessionWorkDir: input.sessionWorkDir,
      skills: input.skills,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
  }

  // On resume: pull the Pi session file out of the sandbox into the fresh
  // local mirror so SessionManager.open can read it.
  let resumeSessionFilePath: string | undefined;
  if (input.isResume && input.resumeSessionFileName) {
    resumeSessionFilePath = await pullSessionFileFromSandbox({
      sandbox,
      sessionWorkDir: input.sessionWorkDir,
      localSessionDir,
      sessionFileName: input.resumeSessionFileName,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
  }

  // Snapshot sandbox state into the local mirror BEFORE the VFS goes live so
  // Pi sees the workspace as soon as it boots.
  await syncLocalWorkspaceFromSandbox({
    sandbox,
    remoteWorkDir: input.sessionWorkDir,
    localWorkDir,
  });

  const workspaceVfs = new PiWorkspaceVfs();
  workspaceVfs.mount(localRoot, logicalRoot);

  const paths = createPiPathMapper(localWorkDir, input.sessionWorkDir);

  // Pi auth + model registry are global to this Pi session.
  const authStorage = AuthStorage.create(
    path.join(logicalAgentDir, 'auth.json'),
  );
  const modelRegistry = ModelRegistry.create(
    authStorage,
    path.join(logicalAgentDir, 'models.json'),
  );
  const settingsManager = SettingsManager.inMemory();

  // Run-scoped env (for the model resolver's gateway fallback heuristic).
  const resolverEnv = resolvePiAuth(input.settings.auth, process.env, {
    authStorage,
    modelRegistry,
  });
  const resolveModel = createPiModelResolver(modelRegistry, resolverEnv);

  let currentInstructions: string | undefined;
  const resourceLoader = new DefaultResourceLoader({
    cwd: logicalWorkDir,
    agentDir: logicalAgentDir,
    settingsManager,
    systemPromptOverride: base =>
      [base, currentInstructions].filter(Boolean).join('\n\n') || undefined,
    appendSystemPromptOverride: () => [],
    extensionFactories: [],
  });
  await resourceLoader.reload();

  // Per-session mutable state we hold across prompts.
  let piSession: AgentSession | undefined;
  let unsubscribe: (() => void) | undefined;
  let lastToolsSignature: string | undefined;
  let sessionFileName: string | undefined;
  let stopped = false;
  const pendingToolResults = new Map<string, PendingToolResult>();

  // Emit channel set at the start of every doPrompt and cleared on end.
  let currentEmit: ((part: HarnessV1StreamPart) => void) | undefined;
  let translatorState: PiTranslatorState | undefined;

  const remoteOps = createPiRemoteOps({
    sandbox,
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

  function buildToolDefinitions(userTools: ReadonlyArray<HarnessV1ToolSpec>): {
    customTools: ToolDefinition[];
    builtinNames: string[];
  } {
    const customTools: ToolDefinition[] = [
      ...PI_NATIVE_BUILTIN_NAMES.map(native =>
        buildBuiltinToolDefinition(native, remoteOps),
      ),
      ...userTools.map(spec =>
        buildUserToolDefinition(spec, pendingToolResults),
      ),
    ];
    return {
      customTools,
      builtinNames: [...PI_NATIVE_BUILTIN_NAMES],
    };
  }

  async function rebuildPiSession(
    userTools: ReadonlyArray<HarnessV1ToolSpec>,
    isFirstBuild: boolean,
  ): Promise<void> {
    if (piSession) {
      unsubscribe?.();
      unsubscribe = undefined;
      piSession.dispose();
      piSession = undefined;
      // Original adapter waits 25 ms here to let Pi's teardown microtasks
      // settle before the next createAgentSession. Port verbatim.
      // TODO(pi-0.77): verify the race still exists; original SDK had a
      // teardown microtask the host needed to wait on.
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    const { customTools, builtinNames } = buildToolDefinitions(userTools);
    const toolNames = customTools.map(t => t.name);
    const resolvedModel = resolveModel(input.settings.model);

    // SessionManager: open the resumed file on the first build of a resumed
    // session; create fresh otherwise.
    const sessionManager =
      isFirstBuild && resumeSessionFilePath
        ? SessionManager.open(
            resumeSessionFilePath,
            logicalSessionDir,
            logicalWorkDir,
          )
        : SessionManager.create(logicalWorkDir, logicalSessionDir);

    const { session } = await createAgentSession({
      cwd: logicalWorkDir,
      agentDir: logicalAgentDir,
      authStorage,
      modelRegistry,
      sessionManager,
      settingsManager,
      resourceLoader,
      customTools,
      tools: toolNames,
      ...(input.settings.thinkingLevel
        ? { thinkingLevel: input.settings.thinkingLevel }
        : {}),
      ...(resolvedModel ? { model: resolvedModel } : {}),
    });
    piSession = session;

    // Pick up the actual session file path so doDetach can persist it. Pi
    // 0.77 emits `.jsonl` files; older builds used `.json`. Persist the
    // basename verbatim — including the extension — so the resume path can
    // round-trip it without guessing the extension.
    const candidatePath = sessionManager.getSessionFile();
    if (candidatePath) {
      sessionFileName = path.basename(candidatePath);
    }

    translatorState = createPiTranslatorState({
      builtinToolNames: builtinNames,
      nativeToCommon: NATIVE_TO_COMMON,
    });

    unsubscribe = piSession.subscribe(rawEvent => {
      if (!currentEmit || !translatorState) return;
      const event = parseNativeEvent(rawEvent);
      if (!event) return;
      for (const part of translatePiEvent(event, translatorState)) {
        currentEmit(part);
      }
    });
  }

  const sessionImpl: HarnessV1Session = {
    sessionId: input.sessionId,

    doPrompt: async (
      promptOpts: HarnessV1PromptOptions,
    ): Promise<HarnessV1PromptControl> => {
      if (stopped) {
        throw new Error('Pi session has been stopped.');
      }

      const text = extractUserText(promptOpts.prompt);
      const userTools = promptOpts.tools ?? [];
      const signature = JSON.stringify(userTools.map(t => t.name).sort());
      const needsRebuild =
        piSession == null || signature !== lastToolsSignature;
      if (needsRebuild) {
        await rebuildPiSession(userTools, piSession == null);
        lastToolsSignature = signature;
      }

      currentInstructions = promptOpts.instructions;
      await resourceLoader.reload();
      await syncLocalWorkspaceFromSandbox({
        sandbox,
        remoteWorkDir: input.sessionWorkDir,
        localWorkDir,
      });

      currentEmit = promptOpts.emit;
      // Fresh translator state for the new turn — keep the tool sets the
      // session was built with.
      translatorState = createPiTranslatorState({
        builtinToolNames: [...PI_NATIVE_BUILTIN_NAMES],
        nativeToCommon: NATIVE_TO_COMMON,
      });

      promptOpts.emit({ type: 'stream-start' });

      const turnPromise = (async () => {
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

        try {
          await session.prompt(text);

          if (terminalError) {
            promptOpts.emit({ type: 'error', error: new Error(terminalError) });
            return;
          }

          const stats = session.getSessionStats();
          const finishReason = {
            unified: 'stop' as const,
            raw: undefined,
          };
          const usage = {
            inputTokens: {
              total: stats.tokens.input,
              noCache: undefined,
              cacheRead: stats.tokens.cacheRead,
              cacheWrite: stats.tokens.cacheWrite,
            },
            outputTokens: {
              total: stats.tokens.output,
              text: undefined,
              reasoning: undefined,
            },
          };
          // `finish-step` populates the step's finishReason + usage (the
          // agent's result builder reads this); `finish` marks the turn end
          // with totalUsage.
          promptOpts.emit({ type: 'finish-step', finishReason, usage });
          promptOpts.emit({
            type: 'finish',
            finishReason,
            totalUsage: usage,
          });
        } catch (err) {
          promptOpts.emit({ type: 'error', error: err });
        } finally {
          unsubErr();
        }
      })();

      const abortHandler = () => {
        piSession?.abort().catch(() => {});
      };
      if (promptOpts.abortSignal) {
        promptOpts.abortSignal.addEventListener('abort', abortHandler, {
          once: true,
        });
      }

      const done = turnPromise.finally(() => {
        promptOpts.abortSignal?.removeEventListener('abort', abortHandler);
        currentEmit = undefined;
      });

      const control: HarnessV1PromptControl = {
        async submitToolResult(args) {
          const pending = pendingToolResults.get(args.toolCallId);
          if (!pending) return;
          pendingToolResults.delete(args.toolCallId);
          pending.resolve(args.output);
        },
        async submitUserMessage(text) {
          await piSession?.steer(text);
        },
        done,
      };

      return control;
    },

    doStop: async () => {
      if (stopped) return;
      stopped = true;
      settlePendingToolResults('Pi session stopped');
      unsubscribe?.();
      unsubscribe = undefined;
      piSession?.dispose();
      piSession = undefined;
      workspaceVfs.unmount();
      await rm(localRoot, { recursive: true, force: true });
    },

    doDetach: async (): Promise<HarnessV1ResumeState> => {
      if (stopped) {
        throw new Error('Pi session has been stopped.');
      }
      stopped = true;
      settlePendingToolResults('Pi session detached');

      // Persist the Pi session file into the sandbox so a future process
      // can pick it up after `provider.resume({ sessionId })` reattaches.
      if (sessionFileName) {
        try {
          await persistSessionFileToSandbox({
            sandbox,
            sessionWorkDir: input.sessionWorkDir,
            localSessionDir,
            sessionFileName,
          });
        } catch {
          // Best-effort: a missing session file means resume returns to a
          // fresh conversation rather than failing detach.
        }
      }

      unsubscribe?.();
      unsubscribe = undefined;
      piSession?.dispose();
      piSession = undefined;
      workspaceVfs.unmount();
      await rm(localRoot, { recursive: true, force: true });

      return {
        harnessId: HARNESS_ID,
        specificationVersion: 'harness-v1',
        data: sessionFileName ? { sessionFileName } : {},
      };
    },
  };

  return sessionImpl;
}

function asPiToolResult(text: string): AgentToolResult<unknown> {
  return {
    content: [{ type: 'text', text }],
    details: undefined,
  };
}

function buildBuiltinToolDefinition(
  native: (typeof PI_NATIVE_BUILTIN_NAMES)[number],
  remoteOps: PiRemoteOps,
): ToolDefinition {
  switch (native) {
    case 'read':
      return defineTool({
        name: 'read',
        label: 'read',
        description: 'Read file contents.',
        parameters: Type.Object({ file_path: Type.String() }),
        async execute(_id, params) {
          const buf = await remoteOps.readBuffer(params.file_path);
          return asPiToolResult(buf.toString('utf8'));
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
        async execute(_id, params) {
          await remoteOps.writeFile(params.file_path, params.content);
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
        async execute(_id, params) {
          await remoteOps.editFile(
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
          timeout: Type.Optional(Type.Number()),
        }),
        async execute(_id, params, signal) {
          const chunks: Buffer[] = [];
          const result = await remoteOps.exec(params.command, '.', {
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
          return asPiToolResult(text);
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
        async execute(_id, params) {
          const out = await remoteOps.grepFiles(params.pattern, params);
          return asPiToolResult(out);
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
        async execute(_id, params) {
          const matches = await remoteOps.findFiles(
            params.pattern,
            params.path ?? '.',
            params.limit ?? 1_000,
          );
          return asPiToolResult(matches.join('\n'));
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
        async execute(_id, params) {
          const entries = await remoteOps.listDirectory(
            params.path ?? '.',
            params.limit ?? 500,
          );
          return asPiToolResult(entries.join('\n'));
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
      }).then(output => asPiToolResult(serializeToolOutput(output)));
    },
  });
}
