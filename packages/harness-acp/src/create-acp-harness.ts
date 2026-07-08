import {
  commonTool,
  HarnessCapabilityUnsupportedError,
  type HarnessV1,
  type HarnessV1Bootstrap,
  type HarnessV1BuiltinTool as HarnessV1BuiltinToolType,
  type HarnessV1ContinueTurnOptions,
  type HarnessV1ContinueTurnState,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
  type HarnessV1StartOptions,
  type HarnessV1StreamPart,
} from "@ai-sdk/harness";
import type { Experimental_SandboxProcess } from "@ai-sdk/provider-utils";
import { z } from "zod/v4";

import type { AcpBridgeChannel } from "./acp-bridge.js";
import {
  acpLifecycleStateSchema,
  attachAcpBridge,
  createAcpRpcClient,
  initializeAcpSession,
  runAcpPromptTurn,
  spawnAcpBridge,
  type AcpHarnessConfig,
} from "./acp-session.js";
import type { NdjsonRpcClient } from "./ndjson-rpc.js";
import { hostToolNames } from "./stream-mapper.js";

export type AcpHarnessSettings = {
  readonly harnessId: string;
  readonly getBootstrap: () => Promise<HarnessV1Bootstrap>;
  readonly command: string;
  readonly authMethodId: string;
  readonly authMeta?: Record<string, unknown>;
  readonly model?: string;
  readonly env?: Record<string, string>;
  readonly port?: number;
  readonly startupTimeoutMs?: number;
  readonly builtinTools?: Record<string, HarnessV1BuiltinToolType>;
  readonly registerRpcHandlers?: AcpHarnessConfig["registerRpcHandlers"];
};

const DEFAULT_BUILTIN_TOOLS = {
  read: commonTool("read", {
    nativeName: "read",
    toolUseKind: "readonly",
    description: "Read file contents.",
    inputSchema: z.object({ file_path: z.string() }),
  }),
  write: commonTool("write", {
    nativeName: "write",
    toolUseKind: "edit",
    description: "Write file contents.",
    inputSchema: z.object({ file_path: z.string(), content: z.string() }),
  }),
  edit: commonTool("edit", {
    nativeName: "edit",
    toolUseKind: "edit",
    description: "Edit a file.",
    inputSchema: z.object({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
    }),
  }),
  bash: commonTool("bash", {
    nativeName: "bash",
    toolUseKind: "bash",
    description: "Run a shell command.",
    inputSchema: z.object({ command: z.string() }),
  }),
  grep: commonTool("grep", {
    nativeName: "grep",
    toolUseKind: "readonly",
    description: "Search file contents.",
    inputSchema: z.object({ pattern: z.string() }),
  }),
  glob: commonTool("glob", {
    nativeName: "glob",
    toolUseKind: "readonly",
    description: "Find files by glob pattern.",
    inputSchema: z.object({ pattern: z.string() }),
  }),
  webSearch: commonTool("webSearch", {
    nativeName: "web_search",
    toolUseKind: "readonly",
    description: "Search the web.",
    inputSchema: z.object({ query: z.string() }),
  }),
} as const;

interface AcpSessionState {
  acpSessionId?: string;
  instructionsApplied: boolean;
  bridgePort: number;
  bridgeToken: string;
  channel: AcpBridgeChannel;
  proc?: Experimental_SandboxProcess;
  rpc: NdjsonRpcClient;
  bridgeStateDir: string;
  bootstrapDir: string;
  attached: boolean;
}

function createAcpHarnessSession(input: {
  sessionId: string;
  config: AcpHarnessConfig;
  state: AcpSessionState;
  isResume: boolean;
  modelId?: string;
}): HarnessV1Session {
  let activeControl: HarnessV1PromptControl | undefined;

  return {
    sessionId: input.sessionId,
    isResume: input.isResume,
    modelId: input.modelId ?? input.config.model,

    doPromptTurn: async (options: HarnessV1PromptTurnOptions) => {
      if (!input.state.rpc || !input.state.acpSessionId) {
        throw new Error("ACP session is not initialized");
      }

      const hostNames = hostToolNames(options.tools ?? []);
      let doneResolve!: () => void;
      let doneReject!: (error: unknown) => void;
      const done = new Promise<void>((resolve, reject) => {
        doneResolve = resolve;
        doneReject = reject;
      });

      const control: HarnessV1PromptControl = {
        submitToolResult: async (result) => {
          await input.state.rpc.request("session/tool_result", {
            sessionId: input.state.acpSessionId,
            toolCallId: result.toolCallId,
            output: result.output,
            isError: result.isError,
          });
        },
        done,
      };
      activeControl = control;

      void (async () => {
        try {
          const turn = await runAcpPromptTurn({
            rpc: input.state.rpc,
            acpSessionId: input.state.acpSessionId!,
            prompt:
              typeof options.prompt === "string" ? options.prompt : JSON.stringify(options.prompt),
            tools: options.tools ?? [],
            instructions: options.instructions,
            instructionsApplied: input.state.instructionsApplied,
            emit: options.emit,
            hostToolNames: hostNames,
            getControl: () => activeControl,
            registerRpcHandlers: input.config.registerRpcHandlers,
          });
          input.state.instructionsApplied = turn.instructionsApplied;
          doneResolve();
        } catch (error) {
          options.emit({ type: "error", error });
          doneReject(error);
        }
      })();

      return control;
    },

    doContinueTurn: async (options: HarnessV1ContinueTurnOptions) => {
      return createAcpHarnessSession(input).doPromptTurn({
        prompt: "",
        tools: options.tools,
        emit: options.emit,
        abortSignal: options.abortSignal,
      });
    },

    doCompact: async () => {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: input.config.harnessId,
        message: `Harness '${input.config.harnessId}' does not support manual compaction.`,
      });
    },

    doSuspendTurn: async (): Promise<HarnessV1ContinueTurnState> => {
      const lastSeenEventId = await input.state.channel.suspend();
      return {
        type: "continue-turn",
        harnessId: input.config.harnessId,
        specificationVersion: "harness-v1",
        data: {
          acpSessionId: input.state.acpSessionId,
          instructionsApplied: input.state.instructionsApplied,
          bridge: {
            port: input.state.bridgePort,
            token: input.state.bridgeToken,
            lastSeenEventId,
          },
        },
      };
    },

    doDetach: async (): Promise<HarnessV1ResumeSessionState> => {
      const lastSeenEventId = await input.state.channel.suspend();
      return {
        type: "resume-session",
        harnessId: input.config.harnessId,
        specificationVersion: "harness-v1",
        data: {
          acpSessionId: input.state.acpSessionId,
          instructionsApplied: input.state.instructionsApplied,
          bridge: {
            port: input.state.bridgePort,
            token: input.state.bridgeToken,
            lastSeenEventId,
          },
        },
      };
    },

    doStop: async (): Promise<HarnessV1ResumeSessionState> => {
      const lastSeenEventId = await input.state.channel.suspend();
      await input.state.rpc.close();
      return {
        type: "resume-session",
        harnessId: input.config.harnessId,
        specificationVersion: "harness-v1",
        data: {
          acpSessionId: input.state.acpSessionId,
          instructionsApplied: input.state.instructionsApplied,
          bridge: {
            port: input.state.bridgePort,
            token: input.state.bridgeToken,
            lastSeenEventId,
          },
        },
      };
    },

    doDestroy: async () => {
      input.state.channel.beginClose();
      input.state.channel.send({ type: "shutdown" });
      await input.state.rpc.close();
      try {
        await input.state.proc?.kill();
      } catch {
        // best-effort
      }
    },
  };
}

export function createAcpHarness(settings: AcpHarnessSettings): HarnessV1 {
  return {
    specificationVersion: "harness-v1",
    harnessId: settings.harnessId,
    builtinTools: settings.builtinTools ?? DEFAULT_BUILTIN_TOOLS,
    lifecycleStateSchema: acpLifecycleStateSchema,
    getBootstrap: settings.getBootstrap,

    doStart: async (startOpts: HarnessV1StartOptions) => {
      const sandboxSession = startOpts.sandboxSession;
      const session = sandboxSession.restricted();
      const lifecycleState = startOpts.continueFrom ?? startOpts.resumeFrom;
      const resumeData = acpLifecycleStateSchema.safeParse(lifecycleState?.data).data;
      const coords = resumeData?.bridge;
      const isResume = lifecycleState != null;

      const bootstrap = await settings.getBootstrap();
      const bootstrapDir = bootstrap.bootstrapDir;
      const bridgeStateDir = `${bootstrapDir}/bridge-state`;
      const config: AcpHarnessConfig = {
        harnessId: settings.harnessId,
        command: settings.command,
        authMethodId: settings.authMethodId,
        authMeta: settings.authMeta,
        model: settings.model,
        env: settings.env,
        registerRpcHandlers: settings.registerRpcHandlers,
      };

      let channel: AcpBridgeChannel | undefined;
      let proc: Experimental_SandboxProcess | undefined;
      let bridgePort = coords?.port ?? 0;
      let bridgeToken = coords?.token ?? "";
      let attached = false;

      if (coords) {
        try {
          channel = await attachAcpBridge({
            sandboxSession,
            coords,
            abortSignal: startOpts.abortSignal,
          });
          bridgePort = coords.port;
          bridgeToken = coords.token;
          attached = true;
        } catch {
          // Bridge gone — respawn below.
        }
      }

      if (!channel) {
        const spawned = await spawnAcpBridge({
          sandboxSession,
          session,
          sessionWorkDir: startOpts.sessionWorkDir,
          bootstrapDir,
          bridgeStateDir,
          config,
          abortSignal: startOpts.abortSignal,
          startupTimeoutMs: settings.startupTimeoutMs,
        });
        channel = spawned.channel;
        proc = spawned.proc;
        bridgePort = spawned.port;
        bridgeToken = spawned.token;
        attached = false;
      }

      const rpc = await createAcpRpcClient({
        channel,
        abortSignal: startOpts.abortSignal,
        resume: attached,
      });

      const acpSessionId = await initializeAcpSession({
        rpc,
        sessionWorkDir: startOpts.sessionWorkDir,
        config,
        tools: [],
        existingSessionId: resumeData?.acpSessionId,
        skipInitialize: attached && Boolean(resumeData?.acpSessionId),
        abortSignal: startOpts.abortSignal,
      });

      const state: AcpSessionState = {
        acpSessionId,
        instructionsApplied: resumeData?.instructionsApplied ?? false,
        bridgePort,
        bridgeToken,
        channel,
        proc,
        rpc,
        bridgeStateDir,
        bootstrapDir,
        attached,
      };

      return createAcpHarnessSession({
        sessionId: startOpts.sessionId,
        config,
        state,
        isResume,
        modelId: settings.model,
      });
    },
  };
}

export type { HarnessV1StreamPart };