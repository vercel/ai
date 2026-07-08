import { HarnessCapabilityUnsupportedError } from "@ai-sdk/harness";
import { SandboxChannel } from "@ai-sdk/harness/utils";
import type { HarnessV1NetworkSandboxSession } from "@ai-sdk/harness";
import { WebSocket } from "ws";

import {
  acpOutboundMessageSchema,
  type AcpInboundMessage,
  type AcpOutboundMessage,
} from "./acp-bridge-protocol.js";

export const ACP_BRIDGE_PORT = 4000;

export type AcpBridgeChannel = SandboxChannel<AcpOutboundMessage, AcpInboundMessage>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function openWebSocket(url: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      cleanup();
      try {
        ws.terminate();
      } catch {
        // best-effort
      }
      reject(new Error(`WebSocket open timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
    const cleanup = () => {
      clearTimeout(timer);
      ws.off("open", onOpen);
      ws.off("error", onError);
    };
    const onOpen = () => {
      cleanup();
      resolve(ws);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    ws.on("open", onOpen);
    ws.on("error", onError);
  });
}

function waitForBridgeHello(ws: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onMessage = (raw: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
        const parsed = JSON.parse(text) as { type?: string };
        if (parsed.type === "bridge-hello") settle();
      } catch {
        // wait for valid hello
      }
    };
    const onClose = () => settle(new Error("WebSocket closed before bridge-hello"));
    const onError = (err: Error) => settle(err);
    const timer = setTimeout(
      () => settle(new Error(`bridge did not send bridge-hello within ${timeoutMs}ms`)),
      timeoutMs,
    );
    timer.unref?.();
    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.on("error", onError);
  });
}

export async function openBridgeWebSocket(input: {
  wsUrl: string;
  timeoutMs: number;
}): Promise<WebSocket> {
  const deadline = Date.now() + input.timeoutMs;
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() < deadline) {
    attempt++;
    let ws: WebSocket | undefined;
    try {
      const remaining = Math.max(1, deadline - Date.now());
      ws = await openWebSocket(input.wsUrl, Math.min(10_000, remaining));
      await waitForBridgeHello(ws, Math.min(5_000, Math.max(1, deadline - Date.now())));
      return ws;
    } catch (err) {
      lastError = err;
      try {
        ws?.close();
      } catch {
        // best-effort
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(250 * attempt, 1_000, remaining));
    }
  }

  throw new Error(
    `ACP bridge WebSocket handshake failed within ${input.timeoutMs}ms after ${attempt} attempt(s). Last error: ${formatUnknownError(lastError)}`,
  );
}

export function resolveBridgePort(
  sandboxSession: HarnessV1NetworkSandboxSession,
  override?: number,
): number {
  if (override !== undefined) return override;
  if (sandboxSession.ports.length > 0) return sandboxSession.ports[0]!;
  throw new HarnessCapabilityUnsupportedError({
    harnessId: "acp",
    message:
      "ACP harness needs a TCP port exposed by the sandbox. Create the sandbox with ports: [4000].",
  });
}

export async function buildBridgeWsUrl(input: {
  sandboxSession: HarnessV1NetworkSandboxSession;
  port: number;
  token: string;
}): Promise<string> {
  const base = await input.sandboxSession.getPortUrl({
    port: input.port,
    protocol: "ws",
  });
  return `${base}?agent_bridge_token=${encodeURIComponent(input.token)}`;
}

export function createAcpBridgeChannel(input: {
  connect: () => Promise<WebSocket>;
  initialLastSeenEventId?: number;
}): AcpBridgeChannel {
  return new SandboxChannel<AcpOutboundMessage, AcpInboundMessage>({
    connect: input.connect,
    outboundSchema: acpOutboundMessageSchema,
    initialLastSeenEventId: input.initialLastSeenEventId ?? 0,
  });
}