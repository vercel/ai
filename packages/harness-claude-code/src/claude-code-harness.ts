import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  commonTool,
  HarnessCapabilityUnsupportedError,
  type HarnessV1,
  type HarnessV1Bootstrap,
  type HarnessV1BuiltinTool,
  type HarnessV1Prompt,
  type HarnessV1PromptControl,
  type HarnessV1ResumeState,
  type HarnessV1SandboxHandle,
  type HarnessV1Session,
  type HarnessV1Skill,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import {
  safeParseJSON,
  tool,
  type Experimental_Sandbox,
  type Experimental_SandboxProcess,
} from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { z } from 'zod';
import {
  resolveClaudeCodeEnv,
  type ClaudeCodeAuthOptions,
} from './claude-code-auth';
import { BridgeChannel } from './claude-code-bridge-channel';
import { bridgeReadySchema } from './claude-code-bridge-protocol';
import { translate } from './claude-code-translate';

export type ClaudeCodeHarnessSettings = {
  readonly auth?: ClaudeCodeAuthOptions;
  /**
   * Anthropic model id the underlying `claude` CLI should use. Leaving this
   * unset defers to the CLI's default.
   */
  readonly model?: string;
  /**
   * Hard cap on how many internal turns the CLI can take before yielding
   * back to the caller. Unset means the CLI's default.
   */
  readonly maxTurns?: number;
  /**
   * Controls extended-thinking behavior. `'off'` disables thinking,
   * `'on'` forces it on, `'adaptive'` lets the runtime decide.
   */
  readonly thinking?: 'off' | 'on' | 'adaptive';
  /**
   * Override the port the bridge binds inside the sandbox. By default the
   * adapter uses the first port the sandbox declares via `sandbox.ports`.
   * Only set this if the sandbox declares multiple ports and the first one
   * is reserved for something else.
   */
  readonly port?: number;
  /** Maximum milliseconds to wait for the bridge to advertise its port. Defaults to 120000. */
  readonly startupTimeoutMs?: number;
};

/*
 * Every native tool the Claude Code CLI can invoke, declared as a `ToolSet`
 * keyed by what the bridge emits as `toolName` on the wire
 * (`commonName ?? nativeName`). Schemas transcribed from
 * `@anthropic-ai/claude-agent-sdk`'s `agentSdkTypes.d.ts`.
 *
 * `MCP` (the generic proxy tool inside the Claude Code SDK) is intentionally
 * omitted — the bridge filters out `mcp__harness-tools__*` tool names before
 * emitting them, and other MCP invocations come through with their own
 * server-tool names rather than the literal `'Mcp'` token.
 */
const CLAUDE_CODE_BUILTIN_TOOLS = {
  read: commonTool('read', {
    nativeName: 'Read',
    description: 'Read file contents (text, image, PDF, notebook)',
    inputSchema: z.object({
      file_path: z.string(),
      offset: z.number().optional(),
      limit: z.number().optional(),
      pages: z.string().optional(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'Write',
    description: 'Overwrite or create a file at an absolute path',
    inputSchema: z.object({
      file_path: z.string(),
      content: z.string(),
    }),
  }),
  edit: commonTool('edit', {
    nativeName: 'Edit',
    description: 'Edit a file by exact string replacement',
    inputSchema: z.object({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
    }),
  }),
  bash: commonTool('bash', {
    nativeName: 'Bash',
    description: 'Execute a shell command, optionally in background',
    inputSchema: z.object({
      command: z.string(),
      timeout: z.number().optional(),
      description: z.string().optional(),
      run_in_background: z.boolean().optional(),
      dangerouslyDisableSandbox: z.boolean().optional(),
    }),
  }),
  glob: commonTool('glob', {
    nativeName: 'Glob',
    description: 'Fast file-pattern search using glob syntax',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'Grep',
    description: 'Regex search over file contents via ripgrep',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
      glob: z.string().optional(),
      output_mode: z
        .enum(['content', 'files_with_matches', 'count'])
        .optional(),
      '-B': z.number().optional(),
      '-A': z.number().optional(),
      '-C': z.number().optional(),
      context: z.number().optional(),
      '-n': z.boolean().optional(),
      '-i': z.boolean().optional(),
      '-o': z.boolean().optional(),
      type: z.string().optional(),
      head_limit: z.number().optional(),
      offset: z.number().optional(),
      multiline: z.boolean().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'WebSearch',
    description: 'Issue web search queries with optional domain filters',
    inputSchema: z.object({
      query: z.string(),
      allowed_domains: z.array(z.string()).optional(),
      blocked_domains: z.array(z.string()).optional(),
    }),
  }),

  WebFetch: tool({
    description: 'Fetch a URL and run a prompt against its content',
    inputSchema: z.object({
      url: z.string(),
      prompt: z.string(),
    }),
  }),
  NotebookEdit: tool({
    description: 'Edit, insert, or delete a Jupyter notebook cell',
    inputSchema: z.object({
      notebook_path: z.string(),
      new_source: z.string(),
      cell_id: z.string().optional(),
      cell_type: z.enum(['code', 'markdown']).optional(),
      edit_mode: z.enum(['replace', 'insert', 'delete']).optional(),
    }),
  }),
  TodoWrite: tool({
    description: 'Replace the session todo list',
    inputSchema: z.object({
      todos: z.array(
        z.object({
          content: z.string(),
          status: z.enum(['pending', 'in_progress', 'completed']),
          activeForm: z.string(),
        }),
      ),
    }),
  }),
  Agent: tool({
    description: 'Spawn a subagent with a task',
    inputSchema: z.object({
      description: z.string(),
      prompt: z.string(),
      subagent_type: z.string().optional(),
      model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
      run_in_background: z.boolean().optional(),
      name: z.string().optional(),
      team_name: z.string().optional(),
      mode: z
        .enum([
          'acceptEdits',
          'auto',
          'bypassPermissions',
          'default',
          'dontAsk',
          'plan',
        ])
        .optional(),
      isolation: z.literal('worktree').optional(),
    }),
  }),
  TaskCreate: tool({
    description: 'Create a task in the session-local task list',
    inputSchema: z.object({
      subject: z.string(),
      description: z.string(),
      activeForm: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
  }),
  TaskGet: tool({
    description: 'Retrieve a task by id',
    inputSchema: z.object({ taskId: z.string() }),
  }),
  TaskUpdate: tool({
    description: 'Update fields of an existing task',
    inputSchema: z.object({
      taskId: z.string(),
      subject: z.string().optional(),
      description: z.string().optional(),
      activeForm: z.string().optional(),
      status: z
        .union([
          z.enum(['pending', 'in_progress', 'completed']),
          z.literal('deleted'),
        ])
        .optional(),
      addBlocks: z.array(z.string()).optional(),
      addBlockedBy: z.array(z.string()).optional(),
      owner: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
  }),
  TaskList: tool({
    description: 'Return all tasks in the session-local task list',
    inputSchema: z.object({}),
  }),
  TaskStop: tool({
    description: 'Stop a running background task by id',
    inputSchema: z.object({
      task_id: z.string().optional(),
      shell_id: z.string().optional(),
    }),
  }),
  TaskOutput: tool({
    description: 'Poll for output from a background task',
    inputSchema: z.object({
      task_id: z.string(),
      block: z.boolean(),
      timeout: z.number(),
    }),
  }),
  ListMcpResources: tool({
    description: 'List resources available from MCP servers',
    inputSchema: z.object({ server: z.string().optional() }),
  }),
  ReadMcpResource: tool({
    description: 'Read a specific MCP resource by URI',
    inputSchema: z.object({ server: z.string(), uri: z.string() }),
  }),
  ExitPlanMode: tool({
    description: 'Exit plan mode with optional permission approvals',
    inputSchema: z
      .object({
        allowedPrompts: z
          .array(
            z.object({
              tool: z.literal('Bash'),
              prompt: z.string(),
            }),
          )
          .optional(),
      })
      .passthrough(),
  }),
  EnterWorktree: tool({
    description: 'Create or enter an isolated git worktree',
    inputSchema: z.object({
      name: z.string().optional(),
      path: z.string().optional(),
    }),
  }),
  ExitWorktree: tool({
    description: 'Exit the current worktree session',
    inputSchema: z.object({
      action: z.enum(['keep', 'remove']),
      discard_changes: z.boolean().optional(),
    }),
  }),
  AskUserQuestion: tool({
    description: 'Ask the user multiple-choice questions via a structured UI',
    inputSchema: z.object({
      questions: z
        .array(
          z.object({
            question: z.string(),
            header: z.string(),
            options: z.array(
              z.object({
                label: z.string(),
                description: z.string(),
                preview: z.string().optional(),
              }),
            ),
            multiSelect: z.boolean(),
          }),
        )
        .min(1)
        .max(4),
      answers: z.record(z.string()).optional(),
      annotations: z
        .record(
          z.object({
            preview: z.string().optional(),
            notes: z.string().optional(),
          }),
        )
        .optional(),
      metadata: z.object({ source: z.string().optional() }).optional(),
    }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

const BOOTSTRAP_DIR = '/tmp/harness/claude-code';
const SESSION_DIR_PREFIX = '/tmp/harness/sessions/claude-code';

/**
 * Schema for the adapter-specific portion of `HarnessV1ResumeState.data`
 * produced by Claude Code's `doDetach`. The payload is structurally empty:
 * the framework derives the sandbox via `provider.resume({ sessionId })`,
 * and the Claude SDK's `{ continue: true }` flag rehydrates the thread
 * from the workdir (preserved in the sandbox snapshot).
 */
const claudeCodeResumeStateSchema = z.object({}).passthrough();

export function createClaudeCode(
  settings: ClaudeCodeHarnessSettings = {},
): HarnessV1<typeof CLAUDE_CODE_BUILTIN_TOOLS> {
  let cachedBootstrap: HarnessV1Bootstrap | undefined;

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'claude-code',
    builtinTools: CLAUDE_CODE_BUILTIN_TOOLS,
    resumeStateSchema: claudeCodeResumeStateSchema,
    getBootstrap: async () => {
      if (cachedBootstrap != null) return cachedBootstrap;
      const [pkg, lock, bridge] = await Promise.all([
        readBridgeAsset('package.json'),
        readBridgeAsset('pnpm-lock.yaml'),
        readBridgeAsset('index.mjs'),
      ]);
      cachedBootstrap = {
        harnessId: 'claude-code',
        bootstrapDir: BOOTSTRAP_DIR,
        files: [
          { path: `${BOOTSTRAP_DIR}/package.json`, content: pkg },
          { path: `${BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
          { path: `${BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
        ],
        commands: [
          { command: `mkdir -p ${BOOTSTRAP_DIR}` },
          {
            command: `pnpm --dir ${BOOTSTRAP_DIR} install --frozen-lockfile --store-dir ${BOOTSTRAP_DIR}/.pnpm-store`,
          },
          {
            command: `cd ${BOOTSTRAP_DIR} && if [ -f node_modules/@anthropic-ai/claude-code/install.cjs ]; then node node_modules/@anthropic-ai/claude-code/install.cjs; fi && ./node_modules/.bin/claude --version`,
          },
        ],
      };
      return cachedBootstrap;
    },
    doStart: async startOpts => {
      const handle = requireHandle(startOpts.sandboxHandle);
      const { session } = handle;
      const isResume = startOpts.resumeFrom != null;

      const sessionDir = `${SESSION_DIR_PREFIX}/${startOpts.sessionId}`;
      const port = resolveBridgePort(handle, settings.port);
      const token = randomBytes(32).toString('hex');
      const env = {
        ...resolveClaudeCodeEnv(settings.auth),
        BRIDGE_CHANNEL_TOKEN: token,
        BRIDGE_WS_PORT: String(port),
      };

      // The session dir, env.json and any skill files are already present
      // in the sandbox from the prior session — preserved across the
      // detach/snapshot/resume cycle by the persistent sandbox. Skip the
      // re-write on resume so we don't churn disk for no reason.
      if (!isResume) {
        await session.run({
          command: `mkdir -p ${sessionDir}`,
          abortSignal: startOpts.abortSignal,
        });

        await session.writeTextFile({
          path: `${sessionDir}/env.json`,
          content: JSON.stringify(env),
          abortSignal: startOpts.abortSignal,
        });

        if (startOpts.skills && startOpts.skills.length > 0) {
          await writeSkills({
            sandbox: session,
            workdir: sessionDir,
            skills: startOpts.skills,
            abortSignal: startOpts.abortSignal,
          });
        }
      } else {
        // Rewrite env.json with a fresh token/port for this resume — the
        // bridge process is brand new and needs a token the host owns.
        await session.writeTextFile({
          path: `${sessionDir}/env.json`,
          content: JSON.stringify(env),
          abortSignal: startOpts.abortSignal,
        });
      }

      const proc = await session.spawn({
        command: `node ${BOOTSTRAP_DIR}/bridge.mjs --workdir ${sessionDir}`,
        abortSignal: startOpts.abortSignal,
      });

      const { port: boundPort } = await waitForBridgeReady({
        proc,
        timeoutMs: settings.startupTimeoutMs ?? 120_000,
        abortSignal: startOpts.abortSignal,
      });
      void drainRest(proc.stdout);
      void drainRest(proc.stderr);

      const wsUrl =
        (await handle.getPortUrl({ port: boundPort, protocol: 'ws' })) +
        `?agent_bridge_token=${encodeURIComponent(token)}`;

      const ws = await openWebSocket(wsUrl);
      await waitForBridgeHello(ws, settings.startupTimeoutMs ?? 120_000);
      const channel = new BridgeChannel(ws);

      return createSession({
        sessionId: startOpts.sessionId,
        channel,
        proc,
        model: settings.model,
        maxTurns: settings.maxTurns,
        thinking: settings.thinking,
        // On resume, the first prompt against this bridge is a continuation
        // of the prior conversation. The bridge passes `continue: true` to
        // the Claude SDK so the cached workdir state is rehydrated.
        isResume,
      });
    },
  };
}

function requireHandle(
  handle: HarnessV1SandboxHandle | undefined,
): HarnessV1SandboxHandle {
  if (!handle) {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'claude-code',
      message:
        'The claude-code harness requires a sandbox provider. Pass `sandbox` to the HarnessAgent constructor.',
    });
  }
  return handle;
}

function resolveBridgePort(
  handle: HarnessV1SandboxHandle,
  override: number | undefined,
): number {
  if (override !== undefined) return override;
  if (handle.ports.length > 0) return handle.ports[0];
  throw new HarnessCapabilityUnsupportedError({
    harnessId: 'claude-code',
    message:
      'The claude-code harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or pass `createClaudeCode({ port })`.',
  });
}

/**
 * Materialise skill files into `${workdir}/.claude/skills/<name>.md`. The
 * `claude` CLI auto-discovers skills from that directory on startup, so the
 * files have to be in place before the bridge is spawned. Each file uses
 * the YAML-frontmatter shape the CLI expects.
 */
async function writeSkills({
  sandbox,
  workdir,
  skills,
  abortSignal,
}: {
  sandbox: Experimental_Sandbox;
  workdir: string;
  skills: ReadonlyArray<HarnessV1Skill>;
  abortSignal?: AbortSignal;
}): Promise<void> {
  await sandbox.run({
    command: `mkdir -p ${workdir}/.claude/skills`,
    abortSignal,
  });
  for (const skill of skills) {
    const path = `${workdir}/.claude/skills/${skill.name}.md`;
    const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}\n`;
    await sandbox.writeTextFile({ path, content, abortSignal });
  }
}

async function readBridgeAsset(name: string): Promise<string> {
  const candidates = [
    new URL(`./bridge/${name}`, import.meta.url),
    new URL(`../bridge/${name}`, import.meta.url),
  ];
  let lastErr: unknown;
  for (const url of candidates) {
    try {
      return await readFile(fileURLToPath(url), 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
      lastErr = err;
    }
  }
  throw lastErr ?? new Error(`bridge asset not found: ${name}`);
}

async function waitForBridgeReady({
  proc,
  timeoutMs,
  abortSignal,
}: {
  proc: Experimental_SandboxProcess;
  timeoutMs: number;
  abortSignal: AbortSignal | undefined;
}): Promise<{ port: number }> {
  const reader = proc.stdout.pipeThrough(new TextDecoderStream()).getReader();

  const decoder = lineDecoder();

  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      if (abortSignal?.aborted) {
        await proc.kill();
        throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await proc.kill();
        throw new Error('claude-code bridge did not become ready in time.');
      }
      const { value, done } = (await Promise.race([
        reader.read(),
        new Promise(resolve =>
          setTimeout(
            () => resolve({ value: undefined, done: false }),
            remaining,
          ),
        ),
      ])) as ReadableStreamReadResult<string>;
      if (done) {
        throw new Error('claude-code bridge exited before becoming ready.');
      }
      if (value === undefined) continue;
      for (const line of decoder.push(value)) {
        const parsed = await safeParseJSON({
          text: line,
          schema: bridgeReadySchema,
        });
        if (parsed.success) return { port: parsed.value.port };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function lineDecoder() {
  let buffer = '';
  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines: string[] = [];
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const raw = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const line = raw.replace(/\r$/, '').trim();
        if (line.length > 0) lines.push(line);
      }
      return lines;
    },
  };
}

async function drainRest(stream: ReadableStream<Uint8Array>): Promise<void> {
  try {
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) return;
    }
  } catch {}
}

/**
 * Wait for the bridge's `bridge-hello` message to arrive on the freshly
 * opened WebSocket before any other host-side code touches it.
 *
 * Some sandbox runtimes (Vercel in particular) complete the WS upgrade
 * with the host long before the connection is actually forwarded to the
 * sandbox-side bridge. Anything sent in that gap is silently dropped —
 * including the `start` message we send next. The bridge emits
 * `bridge-hello` the instant it accepts the connection, so receiving it
 * is the only reliable evidence that the end-to-end link is live.
 */
async function waitForBridgeHello(
  ws: WebSocket,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      ws.off('message', onMessage);
      ws.off('close', onClose);
      ws.off('error', onError);
      if (timer) clearTimeout(timer);
    };
    const settle = (err?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve();
    };
    const onMessage = (raw: unknown) => {
      try {
        const text =
          typeof raw === 'string'
            ? raw
            : (raw as Buffer | ArrayBufferLike).toString
              ? (raw as Buffer).toString('utf8')
              : String(raw);
        const parsed = JSON.parse(text) as { type?: unknown };
        if (parsed?.type === 'bridge-hello') settle();
      } catch {
        // Ignore malformed frames while waiting.
      }
    };
    const onClose = () => {
      settle(
        new Error('claude-code bridge closed before sending bridge-hello'),
      );
    };
    const onError = (err: Error) => settle(err);
    const timer = setTimeout(
      () =>
        settle(
          new Error(
            `claude-code bridge did not send bridge-hello within ${timeoutMs}ms`,
          ),
        ),
      timeoutMs,
    );
    timer.unref?.();
    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
  });
}

function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const onOpen = () => {
      ws.off('error', onError);
      resolve(ws);
    };
    const onError = (err: Error) => {
      ws.off('open', onOpen);
      reject(err);
    };
    ws.once('open', onOpen);
    ws.once('error', onError);
  });
}

function createSession({
  sessionId,
  channel,
  proc,
  model,
  maxTurns,
  thinking,
  isResume,
}: {
  sessionId: string;
  channel: BridgeChannel;
  proc: Experimental_SandboxProcess;
  model: string | undefined;
  maxTurns: number | undefined;
  thinking: 'off' | 'on' | 'adaptive' | undefined;
  isResume: boolean;
}): HarnessV1Session {
  let stopped = false;
  let stopPromise: Promise<void> | undefined;
  // Set on the first prompt sent after a cross-process resume so the
  // bridge tells the Claude SDK to continue rather than start a fresh
  // thread. Cleared after the first turn — subsequent turns within this
  // bridge process are continuations by default.
  let pendingResumeFlag = isResume;

  return {
    sessionId,
    doPrompt: async promptOpts => {
      let pendingResolve: (() => void) | undefined;
      let pendingReject: ((err: unknown) => void) | undefined;
      const done = new Promise<void>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
      });

      const unsubs: Array<() => void> = [];
      const forward = (event: HarnessV1StreamPart) => {
        try {
          promptOpts.emit(event);
        } catch {}
      };

      const eventTypes = [
        'stream-start',
        'text-start',
        'text-delta',
        'text-end',
        'reasoning-start',
        'reasoning-delta',
        'reasoning-end',
        'tool-call',
        'tool-result',
        'finish-step',
        'raw',
      ] as const;
      for (const type of eventTypes) {
        unsubs.push(
          channel.on(type, msg => {
            forward(translate(msg));
          }),
        );
      }
      unsubs.push(
        channel.on('finish', msg => {
          forward(translate(msg));
          settleSuccess();
        }),
      );
      unsubs.push(
        channel.on('error', msg => {
          forward(translate(msg));
          settleError(msg.error);
        }),
      );

      const onClose = () => {
        if (!isSettled) {
          settleError(
            new Error('claude-code bridge closed before the turn finished.'),
          );
        }
      };
      channel.onClose(onClose);

      let isSettled = false;
      const settleSuccess = () => {
        if (isSettled) return;
        isSettled = true;
        for (const u of unsubs) u();
        pendingResolve!();
      };
      const settleError = (err: unknown) => {
        if (isSettled) return;
        isSettled = true;
        for (const u of unsubs) u();
        pendingReject!(err);
      };

      const onAbort = () => {
        if (isSettled) return;
        try {
          channel.send({ type: 'abort' });
        } catch {}
        settleError(
          promptOpts.abortSignal?.reason ??
            new DOMException('Aborted', 'AbortError'),
        );
      };
      if (promptOpts.abortSignal) {
        if (promptOpts.abortSignal.aborted) {
          onAbort();
        } else {
          promptOpts.abortSignal.addEventListener('abort', onAbort, {
            once: true,
          });
        }
      }

      const startMessage = {
        type: 'start' as const,
        prompt: extractUserText(promptOpts.prompt),
        instructions: promptOpts.instructions,
        tools: (promptOpts.tools ?? []).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        model,
        maxTurns,
        thinking,
        ...(pendingResumeFlag ? { continue: true } : {}),
      };
      pendingResumeFlag = false;
      channel.send(startMessage);

      const control: HarnessV1PromptControl = {
        submitToolResult: async input => {
          channel.send({
            type: 'tool-result',
            toolCallId: input.toolCallId,
            output: input.output,
            isError: input.isError,
          });
        },
        submitUserMessage: async text => {
          channel.send({ type: 'user-message', text });
        },
        done,
      };
      return control;
    },
    doStop: async () => {
      if (stopped) return stopPromise;
      stopped = true;
      stopPromise = (async () => {
        try {
          if (!channel.isClosed()) {
            channel.send({ type: 'shutdown' });
          }
        } catch {}
        let stopTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            proc.wait(),
            new Promise<void>(resolve => {
              stopTimer = setTimeout(resolve, 5000);
              stopTimer.unref?.();
            }),
          ]);
        } finally {
          if (stopTimer) clearTimeout(stopTimer);
          try {
            await proc.kill();
          } catch {}
          channel.close();
        }
      })();
      return stopPromise;
    },
    doDetach: async () => {
      if (stopped) {
        throw new Error(
          `claude-code session ${sessionId} is already stopped; cannot detach.`,
        );
      }
      stopped = true;
      // Wait for the bridge to acknowledge with `detach-state` before
      // tearing down the process. Bound by a timeout — a hung bridge
      // shouldn't block the host indefinitely.
      const data = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          unsub();
          reject(
            new Error(
              `claude-code session ${sessionId} did not reply to detach within 5s.`,
            ),
          );
        }, 5000);
        timer.unref?.();
        const unsub = channel.on('detach-state', msg => {
          clearTimeout(timer);
          unsub();
          resolve(msg.data);
        });
        try {
          channel.send({ type: 'detach' });
        } catch (err) {
          clearTimeout(timer);
          unsub();
          reject(err);
        }
      });

      // The bridge exits itself ~50ms after sending detach-state. Give
      // it a moment, then ensure the process is reaped and the channel
      // closed.
      let stopTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          proc.wait(),
          new Promise<void>(resolve => {
            stopTimer = setTimeout(resolve, 5000);
            stopTimer.unref?.();
          }),
        ]);
      } finally {
        if (stopTimer) clearTimeout(stopTimer);
        try {
          await proc.kill();
        } catch {}
        channel.close();
      }

      const payload: HarnessV1ResumeState = {
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        data: (data ?? {}) as HarnessV1ResumeState['data'],
      };
      return payload;
    },
  };
}

/*
 * Reduce a `HarnessV1Prompt` to the plain user text the bridge forwards
 * to the Claude SDK. File and image parts on the message are not yet
 * supported by the underlying runtime — throw rather than silently drop
 * them so callers learn about the gap instead of seeing mysteriously
 * truncated prompts.
 */
function extractUserText(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') return prompt;
  const { content } = prompt;
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const part of content) {
    if (part.type !== 'text') {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'claude-code',
        message: `The claude-code harness does not yet support user message parts of type '${part.type}'. Pass a string or a user message whose content contains only text parts.`,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}
