import { randomBytes } from "node:crypto";
import { markBridgeStarting, waitForBridgeReady } from "@ai-sdk/harness/utils";
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1StreamPart,
  HarnessV1ToolSpec,
} from "@ai-sdk/harness";
import type {
  Experimental_SandboxProcess,
  Experimental_SandboxSession,
} from "@ai-sdk/provider-utils";
import { z } from "zod/v4";

import {
  ACP_BRIDGE_PORT,
  buildBridgeWsUrl,
  createAcpBridgeChannel,
  openBridgeWebSocket,
  resolveBridgePort,
  type AcpBridgeChannel,
} from "./acp-bridge.js";
import { acpBridgeCoordsSchema } from "./acp-bridge-protocol.js";
import { NdjsonRpcClient } from "./ndjson-rpc.js";
import {
  closeTextStream,
  createAcpStreamMapperState,
  finishStream,
  mapSessionUpdate,
  toolSpecsToMcpServers,
} from "./stream-mapper.js";
import { WsAcpRpcTransport } from "./ws-rpc-transport.js";

export type AcpRpcHandlerRegistration = (rpc: NdjsonRpcClient) => () => void;

export async function runAcpPromptTurn(input: {
  rpc: NdjsonRpcClient;
  acpSessionId: string;
  prompt: string;
  tools: ReadonlyArray<HarnessV1ToolSpec>;
  instructions?: string;
  instructionsApplied?: boolean;
  emit: (event: HarnessV1StreamPart) => void;
  hostToolNames: Set<string>;
  getControl: () =>
    | {
        submitToolResult(input: {
          toolCallId: string;
          output: unknown;
          isError?: boolean;
        }): PromiseLike<void>;
      }
    | undefined;
  registerRpcHandlers?: AcpRpcHandlerRegistration;
}): Promise<{ stopReason?: string; instructionsApplied: boolean }> {
  const mapper = createAcpStreamMapperState();
  input.emit({ type: "stream-start" });

  let instructionsApplied = input.instructionsApplied ?? false;
  let promptText = input.prompt;
  if (input.instructions && !instructionsApplied) {
    promptText = `${input.instructions}\n\n${input.prompt}`;
    instructionsApplied = true;
  }

  const offUpdate = input.rpc.onNotification("session/update", (params) => {
    const update = (params as { update?: Record<string, unknown> } | undefined)?.update;
    if (update?.sessionUpdate === "tool_call") {
      const toolCall = update as {
        toolCallId?: string;
        toolName?: string;
        input?: unknown;
      };
      if (toolCall.toolCallId && toolCall.toolName && input.hostToolNames.has(toolCall.toolName)) {
        void handleHostToolCall(input, toolCall);
        return;
      }
    }

    for (const part of mapSessionUpdate(mapper, params)) {
      input.emit(part);
    }
  });

  const offPermission = input.rpc.onRequest("session/request_permission", async () => ({
    outcome: { outcome: "selected", optionId: "allow-once" },
  }));

  const offExtensions = input.registerRpcHandlers?.(input.rpc) ?? (() => {});

  try {
    const result = (await input.rpc.request(
      "session/prompt",
      {
        sessionId: input.acpSessionId,
        prompt: [{ type: "text", text: promptText }],
        mcpServers: toolSpecsToMcpServers(input.tools),
      },
      1_800_000,
    )) as { stopReason?: string };

    for (const part of closeTextStream(mapper)) {
      input.emit(part);
    }
    for (const part of finishStream()) {
      input.emit(part);
    }

    return { stopReason: result.stopReason, instructionsApplied };
  } finally {
    offUpdate();
    offPermission();
    offExtensions();
  }
}

async function handleHostToolCall(
  input: {
    emit: (event: HarnessV1StreamPart) => void;
    getControl: () =>
      | {
          submitToolResult(input: {
            toolCallId: string;
            output: unknown;
            isError?: boolean;
          }): PromiseLike<void>;
        }
      | undefined;
  },
  toolCall: { toolCallId?: string; toolName?: string; input?: unknown },
): Promise<void> {
  if (!toolCall.toolCallId || !toolCall.toolName) return;

  const payload =
    typeof toolCall.input === "string" ? toolCall.input : JSON.stringify(toolCall.input ?? {});

  input.emit({
    type: "tool-call",
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: payload,
  });

  input.getControl();
}

export const acpLifecycleStateSchema = z.object({
  acpSessionId: z.string().optional(),
  instructionsApplied: z.boolean().optional(),
  bridge: acpBridgeCoordsSchema.optional(),
});

export interface AcpHarnessConfig {
  harnessId: string;
  command: string;
  authMethodId: string;
  authMeta?: Record<string, unknown>;
  model?: string;
  env?: Record<string, string>;
  clientName?: string;
  clientVersion?: string;
  registerRpcHandlers?: AcpRpcHandlerRegistration;
}

export interface SpawnedAcpBridge {
  port: number;
  token: string;
  channel: AcpBridgeChannel;
  proc: Experimental_SandboxProcess;
}

export async function attachAcpBridge(input: {
  sandboxSession: HarnessV1NetworkSandboxSession;
  coords: z.infer<typeof acpBridgeCoordsSchema>;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}): Promise<AcpBridgeChannel> {
  const wsUrl = await buildBridgeWsUrl({
    sandboxSession: input.sandboxSession,
    port: input.coords.port,
    token: input.coords.token,
  });
  return createAcpBridgeChannel({
    initialLastSeenEventId: input.coords.lastSeenEventId,
    connect: () =>
      openBridgeWebSocket({
        wsUrl,
        timeoutMs: input.timeoutMs ?? 30_000,
      }),
  });
}

export async function spawnAcpBridge(input: {
  sandboxSession: HarnessV1NetworkSandboxSession;
  session: Experimental_SandboxSession;
  sessionWorkDir: string;
  bootstrapDir: string;
  bridgeStateDir: string;
  config: AcpHarnessConfig;
  token?: string;
  abortSignal?: AbortSignal;
  startupTimeoutMs?: number;
}): Promise<SpawnedAcpBridge> {
  const port = resolveBridgePort(input.sandboxSession, ACP_BRIDGE_PORT);
  const token = input.token ?? randomBytes(32).toString("hex");
  const timeoutMs = input.startupTimeoutMs ?? 120_000;

  await markBridgeStarting({
    sandbox: input.session,
    bridgeStateDir: input.bridgeStateDir,
    bridgeType: input.config.harnessId,
    abortSignal: input.abortSignal,
  });

  await input.sandboxSession.setPorts?.([port], {
    abortSignal: input.abortSignal,
  });

  await input.session.run({
    command: `mkdir -p ${input.bridgeStateDir}`,
    abortSignal: input.abortSignal,
  });

  const env = {
    ...(input.config.env ?? {}),
    BRIDGE_CHANNEL_TOKEN: token,
    BRIDGE_WS_PORT: String(port),
    ACP_COMMAND: input.config.command,
    ACP_CWD: input.sessionWorkDir,
  };

  const proc = await input.session.spawn({
    command: `node ${input.bootstrapDir}/bridge.mjs --workdir ${input.sessionWorkDir} --bridge-state-dir ${input.bridgeStateDir}`,
    workingDirectory: input.sessionWorkDir,
    env,
    abortSignal: input.abortSignal,
  });

  const { port: boundPort } = await waitForBridgeReady({
    proc,
    sandbox: input.session,
    bridgeStateDir: input.bridgeStateDir,
    bridgeType: input.config.harnessId,
    timeoutMs,
    abortSignal: input.abortSignal,
  });

  const wsUrl = await buildBridgeWsUrl({
    sandboxSession: input.sandboxSession,
    port: boundPort,
    token,
  });

  const channel = createAcpBridgeChannel({
    connect: () => openBridgeWebSocket({ wsUrl, timeoutMs }),
  });

  return { port: boundPort, token, channel, proc };
}

export async function initializeAcpSession(input: {
  rpc: NdjsonRpcClient;
  sessionWorkDir: string;
  config: AcpHarnessConfig;
  tools: ReadonlyArray<HarnessV1ToolSpec>;
  existingSessionId?: string;
  skipInitialize?: boolean;
  abortSignal?: AbortSignal;
}): Promise<string> {
  if (!input.skipInitialize) {
    await input.rpc.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: {
        name: input.config.clientName ?? "ai-sdk-harness-acp",
        version: input.config.clientVersion ?? "0.1.0",
      },
    });

    await input.rpc.request("authenticate", {
      methodId: input.config.authMethodId,
      ...(input.config.authMeta ? { _meta: input.config.authMeta } : {}),
    });
  }

  if (input.existingSessionId) {
    await input.rpc.request("session/load", { sessionId: input.existingSessionId });
    return input.existingSessionId;
  }

  const created = (await input.rpc.request("session/new", {
    cwd: input.sessionWorkDir,
    ...(input.config.model ? { model: input.config.model } : {}),
    mcpServers: toolSpecsToMcpServers(input.tools),
  })) as { sessionId?: string };

  if (!created.sessionId) {
    throw new Error("ACP session/new did not return sessionId");
  }
  return created.sessionId;
}

export async function createAcpRpcClient(input: {
  channel: AcpBridgeChannel;
  abortSignal?: AbortSignal;
  resume?: boolean;
}): Promise<NdjsonRpcClient> {
  const transport = new WsAcpRpcTransport(input.channel, input.abortSignal);
  const rpc = new NdjsonRpcClient(transport);
  await transport.connect(input.resume ? { resume: true } : undefined);
  return rpc;
}