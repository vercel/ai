#!/usr/bin/env node
/**
 * In-sandbox ACP bridge: WebSocket transport + JSON-RPC stdio proxy.
 * Mirrors @ai-sdk/harness/bridge semantics (token auth, seq replay, bridge-ready).
 */
import { spawn } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { env as procEnv, pid, stdout } from "node:process";
import { WebSocketServer } from "ws";

const WS_OPEN = 1;

function parseArgs(argv) {
  let workdir = procEnv.ACP_CWD ?? procEnv.PWD ?? procEnv.HOME ?? "/";
  let bridgeStateDir = `${workdir}/.bridge-state`;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--workdir" && argv[i + 1]) {
      workdir = argv[++i];
    } else if (argv[i] === "--bridge-state-dir" && argv[i + 1]) {
      bridgeStateDir = argv[++i];
    }
  }
  return { workdir, bridgeStateDir };
}

function serialiseError(err) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function spawnAcpChild(command, workdir) {
  const wrapped =
    "if command -v stdbuf >/dev/null 2>&1; then exec stdbuf -oL -eL bash -c " +
    JSON.stringify(command) +
    "; else exec bash -c " +
    JSON.stringify(command) +
    "; fi";
  return spawn("bash", ["-c", wrapped], {
    cwd: workdir,
    env: { ...procEnv, PYTHONUNBUFFERED: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

const { workdir, bridgeStateDir } = parseArgs(process.argv);
const expectedToken = procEnv.BRIDGE_CHANNEL_TOKEN ?? "";
const bridgeWsPort = parseInt(procEnv.BRIDGE_WS_PORT ?? "0", 10);
const acpCommand = procEnv.ACP_COMMAND ?? "grok agent stdio";

const bridgeMetaPath = `${bridgeStateDir}/bridge-meta.json`;
const eventLogPath = `${bridgeStateDir}/event-log.ndjson`;

let currentBoundPort = 0;
let activeSocket;
let seqCounter = 0;
let eventLog = [];
let diskBuffer = "";
let flushPromise = null;

try {
  await mkdir(bridgeStateDir, { recursive: true });
} catch {
  // best-effort
}

const flushEventsToDisk = async () => {
  while (diskBuffer.length > 0) {
    const buf = diskBuffer;
    diskBuffer = "";
    await appendFile(eventLogPath, buf).catch(() => {});
  }
};

const scheduleEventFlush = () => {
  if (flushPromise) return;
  flushPromise = new Promise((resolve) => {
    setImmediate(() => {
      void flushEventsToDisk().finally(resolve);
    });
  }).finally(() => {
    flushPromise = null;
    if (diskBuffer.length > 0) scheduleEventFlush();
  });
};

if (procEnv.BRIDGE_REPLAY_FROM_DISK === "1" && existsSync(eventLogPath)) {
  try {
    const lines = readFileSync(eventLogPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    eventLog = lines.map((line) => ({
      seq: JSON.parse(line).seq,
      line,
    }));
    seqCounter = eventLog.at(-1)?.seq ?? 0;
  } catch {
    eventLog = [];
    seqCounter = 0;
  }
}

const writeBridgeMeta = async (state) => {
  try {
    await writeFile(
      bridgeMetaPath,
      JSON.stringify({ type: "acp", port: currentBoundPort, state, pid }),
    );
  } catch {
    // best-effort
  }
};

const sendControl = (msg) => {
  if (activeSocket?.readyState === WS_OPEN) {
    try {
      activeSocket.send(JSON.stringify(msg));
    } catch {
      // best-effort
    }
  }
};

const emit = (event) => {
  const seq = ++seqCounter;
  const line = JSON.stringify({ ...event, seq });
  eventLog.push({ seq, line });
  diskBuffer += `${line}\n`;
  scheduleEventFlush();
  if (activeSocket?.readyState === WS_OPEN) {
    try {
      activeSocket.send(line);
    } catch {
      // replay on reconnect
    }
  }
};

const replay = (ws, afterSeq) => {
  for (const entry of eventLog) {
    if (entry.seq > afterSeq && ws.readyState === WS_OPEN) {
      ws.send(entry.line);
    }
  }
};

const child = spawnAcpChild(acpCommand, workdir);
let stdoutBuffer = "";
const stderrTail = [];
const MAX_STDERR = 40;

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString();
  const lines = stdoutBuffer.split("\n");
  stdoutBuffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    emit({ type: "rpc-line", line });
  }
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  process.stderr.write(chunk);
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    stderrTail.push(trimmed);
    if (stderrTail.length > MAX_STDERR) stderrTail.shift();
    emit({ type: "sandbox-log", source: "acp", stream: "stderr", line: trimmed });
  }
});

child.on("error", (error) => {
  emit({
    type: "error",
    error: serialiseError(error),
  });
});

child.on("exit", (code) => {
  emit({
    type: "error",
    error: { message: `ACP child exited with code ${String(code ?? 1)}` },
  });
});

const handleInbound = (msg, ws) => {
  switch (msg.type) {
    case "rpc-send":
      if (msg.line) {
        child.stdin.write(msg.line.trimEnd() + "\n");
      }
      return;
    case "resume":
      replay(ws, msg.lastSeenEventId ?? 0);
      return;
    case "shutdown":
      void writeBridgeMeta("done");
      try {
        ws.close(1000, "shutdown");
      } finally {
        wss.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 1000).unref();
      }
      return;
    case "detach":
      void writeBridgeMeta("done");
      sendControl({ type: "bridge-detach", data: { stderrTail } });
      try {
        ws.close(1000, "detach");
      } finally {
        wss.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 1000).unref();
      }
      return;
    case "abort":
      return;
    default:
      return;
  }
};

void writeBridgeMeta("init");

const wss = new WebSocketServer({ port: bridgeWsPort, host: "0.0.0.0" });

wss.on("listening", () => {
  const addr = wss.address();
  currentBoundPort = typeof addr === "object" && addr ? addr.port : 0;
  void writeBridgeMeta("waiting");
  stdout.write(JSON.stringify({ type: "bridge-ready", port: currentBoundPort }) + "\n");
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.searchParams.get("agent_bridge_token") !== expectedToken) {
    ws.close(1008, "unauthorized");
    return;
  }

  activeSocket = ws;
  sendControl({
    type: "bridge-hello",
    state: "waiting",
    lastSeq: seqCounter,
  });

  ws.on("message", (raw) => {
    let parsed;
    try {
      const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
      parsed = JSON.parse(text);
    } catch (err) {
      sendControl({
        type: "error",
        error: `protocol parse error: ${err?.message ?? String(err)}`,
      });
      return;
    }
    handleInbound(parsed, ws);
  });

  ws.on("close", () => {
    if (activeSocket === ws) activeSocket = undefined;
  });
});

process.on("uncaughtException", (err) => {
  emit({ type: "error", error: serialiseError(err) });
});
process.on("unhandledRejection", (err) => {
  emit({ type: "error", error: serialiseError(err) });
});

await new Promise((resolve, reject) => {
  if (wss.address() != null) {
    resolve();
    return;
  }
  wss.once("listening", resolve);
  wss.once("error", reject);
});
