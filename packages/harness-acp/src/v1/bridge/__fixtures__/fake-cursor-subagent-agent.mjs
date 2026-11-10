/**
 * A fake ACP agent that starts a background sub-agent the way cursor-agent
 * (2026.11.05) does, for the bridge tests. It speaks newline-delimited JSON-RPC
 * on stdio and appends what it saw to the file named by its first argument.
 *
 * Like cursor-agent, it holds `session/prompt` until the background sub-agent
 * ends only when `initialize` advertised `clientCapabilities.subagents` (or
 * `_meta.subagents`). Without it, the prompt answers while the sub-agent still
 * runs. While it holds the prompt it sends `subagent_spawned`, then the
 * `cursor/task` request, then `subagent_state_update` `completed`, then the
 * model's answer to the completion.
 */
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const logPath = process.argv[2];
const log = entry => appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
const send = message =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const enabled = value =>
  value === true || (value != null && typeof value === 'object');

let subagents = false;
const pendingRequests = new Map();

function update(sessionId, value) {
  send({ method: 'session/update', params: { sessionId, update: value } });
}

function text(sessionId, value) {
  update(sessionId, {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: value },
  });
}

function request(method, params) {
  const id = `agent-${pendingRequests.size + 1}`;
  send({ id, method, params });
  return new Promise(resolve => pendingRequests.set(id, resolve));
}

async function prompt({ sessionId }) {
  text(sessionId, 'Started a background sub-agent.');
  if (!subagents) return { stopReason: 'end_turn' };
  const meta = { cursor: { toolCallId: 'tool-task-1', agentId: 'agent-a' } };
  update(sessionId, {
    sessionUpdate: 'subagent_spawned',
    subagentSessionId: 'subagent-1',
    name: 'explore',
    task: 'Find the port the server listens on.',
    capabilities: {},
    _meta: meta,
  });
  const answer = await request('cursor/task', {
    toolCallId: 'tool-task-1',
    description: 'Find the port',
    prompt: 'Find the port the server listens on.',
    subagentType: 'explore',
    agentId: 'agent-a',
    durationMs: 1200,
  });
  log({ event: 'cursor/task answered', answer });
  update(sessionId, {
    sessionUpdate: 'subagent_state_update',
    subagentSessionId: 'subagent-1',
    state: 'completed',
    _meta: meta,
  });
  text(sessionId, 'BG_DONE');
  return { stopReason: 'end_turn' };
}

async function handle({ method, params }) {
  switch (method) {
    case 'initialize':
      subagents =
        enabled(params.clientCapabilities?.subagents) ||
        enabled(params.clientCapabilities?._meta?.subagents);
      log({ event: 'initialize', clientCapabilities: params.clientCapabilities });
      return {
        protocolVersion: params.protocolVersion,
        agentCapabilities: {
          loadSession: true,
          mcpCapabilities: { http: true },
          sessionCapabilities: subagents ? { subagents: {} } : {},
        },
      };
    case 'session/new':
      return { sessionId: 'session-1' };
    case 'session/prompt':
      return prompt(params);
    default:
      throw new Error(`Unsupported method ${method}`);
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  if (line.trim().length === 0) continue;
  const message = JSON.parse(line);
  if (message.method == null) {
    pendingRequests.get(message.id)?.(
      message.error == null ? { result: message.result } : { error: message.error },
    );
    continue;
  }
  if (message.id == null) continue;
  handle(message).then(
    result => send({ id: message.id, result }),
    error =>
      send({ id: message.id, error: { code: -32603, message: String(error) } }),
  );
}
