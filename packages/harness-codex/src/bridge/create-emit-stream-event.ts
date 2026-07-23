import type { HarnessV1BuiltinToolName } from '@ai-sdk/harness';
import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import { randomUUID } from 'node:crypto';
import type { CodexStepTracker } from './codex-step-tracker';

type Emit = (message: Record<string, unknown>) => void;

export type CodexItem = {
  type: string;
  id?: string;
  text?: string;
  command?: string;
  exit_code?: number;
  aggregated_output?: string;
  status?: 'in_progress' | 'completed' | 'failed';
  server?: string;
  tool?: string;
  arguments?: unknown;
  result?: { content?: unknown; structured_content?: unknown } | unknown;
  error?: { message?: string };
  query?: string;
  message?: string;
  changes?: ReadonlyArray<{
    path: string;
    kind: 'add' | 'delete' | 'update';
  }>;
};

export type CodexEvent = {
  type:
    | 'thread.started'
    | 'turn.completed'
    | 'turn.failed'
    | 'error'
    | 'item.started'
    | 'item.updated'
    | 'item.completed';
  item?: CodexItem;
  usage?: Record<string, number>;
  error?: { message: string };
  message?: string;
  thread_id?: string;
};

/*
 * Native Codex tool name → cross-harness common name. Tools outside this map
 * (e.g. MCP tools the model invokes by name) have no common equivalent; their
 * native name is forwarded as-is on `tool-call` events.
 */
const NATIVE_TO_COMMON: Readonly<Record<string, HarnessV1BuiltinToolName>> = {
  shell: 'bash',
  web_search: 'webSearch',
};

function toCommonName(nativeName: string): HarnessV1BuiltinToolName | string {
  return NATIVE_TO_COMMON[nativeName] ?? nativeName;
}

export function createEmitStreamEvent({
  send,
  stepTracker,
  setTurnUsage,
  setThreadId,
  emitWarning,
  emitError,
}: {
  send: Emit;
  stepTracker: CodexStepTracker;
  setTurnUsage: (usage: Record<string, unknown>) => void;
  setThreadId: (threadId: string) => void;
  emitWarning: BridgeTurn['emitWarning'];
  emitError: BridgeTurn['emitError'];
}): (event: CodexEvent) => void {
  const textByItem = new Map<string, string>();
  const reasoningByItem = new Map<string, string>();

  return event => {
    if (
      event.type === 'thread.started' &&
      typeof event.thread_id === 'string'
    ) {
      setThreadId(event.thread_id);
      // Announce to the host so it can include the id in resume state.
      send({ type: 'bridge-thread', threadId: event.thread_id });
    }
    if (event.type === 'turn.completed') {
      if (event.usage) setTurnUsage(mapUsage(event.usage));
      stepTracker.finishStep();
      return;
    }
    if (event.type === 'turn.failed') {
      emitError({
        error: event.error?.message ?? 'codex turn failed',
        message: 'codex turn failed',
      });
      return;
    }
    if (event.type === 'error') {
      emitError({
        error: event.message ?? 'codex error',
        message: 'codex stream error',
      });
      return;
    }
    if (!event.item) return;
    const item = event.item;
    const id = item.id ?? randomUUID();
    const observeStep = (): void => {
      stepTracker.observeEvent({ event, itemId: id });
    };

    if (item.type === 'agent_message' && typeof item.text === 'string') {
      /*
       * The presence of `id` in `textByItem` — not the `item.started` event —
       * marks the text part as opened. Codex does not guarantee an
       * `item.started` event carrying text precedes the first `item.updated`
       * with text, so keying the `text-start` off the event type can emit a
       * `text-delta` for a part that was never opened. Opening lazily on the
       * first event with text keeps `text-start` before any `text-delta`.
       */
      if (!textByItem.has(id)) {
        send({ type: 'text-start', id });
        textByItem.set(id, '');
      }
      const last = textByItem.get(id) ?? '';
      const next = item.text;
      if (next.length > last.length) {
        send({ type: 'text-delta', id, delta: next.slice(last.length) });
        textByItem.set(id, next);
      }
      if (event.type === 'item.completed') send({ type: 'text-end', id });
      observeStep();
      return;
    }

    if (item.type === 'reasoning' && typeof item.text === 'string') {
      if (!reasoningByItem.has(id)) {
        send({ type: 'reasoning-start', id });
        reasoningByItem.set(id, '');
      }
      const last = reasoningByItem.get(id) ?? '';
      const next = item.text;
      if (next.length > last.length) {
        send({ type: 'reasoning-delta', id, delta: next.slice(last.length) });
        reasoningByItem.set(id, next);
      }
      if (event.type === 'item.completed') send({ type: 'reasoning-end', id });
      observeStep();
      return;
    }

    if (item.type === 'command_execution') {
      const nativeName = 'shell';
      if (event.type === 'item.started') {
        send({
          type: 'tool-call',
          toolCallId: id,
          toolName: toCommonName(nativeName),
          nativeName,
          input: JSON.stringify({ command: item.command ?? '' }),
          providerExecuted: true,
        });
      } else if (event.type === 'item.completed') {
        send({
          type: 'tool-result',
          toolCallId: id,
          toolName: toCommonName(nativeName),
          result: {
            exitCode: item.exit_code ?? null,
            output: item.aggregated_output ?? '',
            status: item.status ?? 'completed',
          },
        });
      }
      observeStep();
      return;
    }

    if (item.type === 'mcp_tool_call') {
      if (event.type === 'item.started') {
        send({
          type: 'tool-call',
          toolCallId: id,
          toolName: item.tool ?? 'unknown',
          nativeName: item.tool ?? 'unknown',
          input: JSON.stringify(item.arguments ?? {}),
          providerExecuted: true,
        });
      } else if (event.type === 'item.completed') {
        send({
          type: 'tool-result',
          toolCallId: id,
          toolName: item.tool ?? 'unknown',
          result: extractMcpToolCallResult(item),
        });
      }
      observeStep();
      return;
    }

    if (item.type === 'web_search') {
      const nativeName = 'web_search';
      if (event.type === 'item.started') {
        send({
          type: 'tool-call',
          toolCallId: id,
          toolName: toCommonName(nativeName),
          nativeName,
          input: JSON.stringify({ query: item.query ?? '' }),
          providerExecuted: true,
        });
      } else if (event.type === 'item.completed') {
        send({
          type: 'tool-result',
          toolCallId: id,
          toolName: toCommonName(nativeName),
          result: item.result ?? null,
        });
      }
      observeStep();
      return;
    }

    if (item.type === 'file_change' && event.type === 'item.completed') {
      for (const change of item.changes ?? []) {
        send({
          type: 'file-change',
          event:
            change.kind === 'add'
              ? 'create'
              : change.kind === 'delete'
                ? 'delete'
                : 'modify',
          path: change.path,
        });
      }
      observeStep();
      return;
    }

    if (item.type === 'error' && event.type === 'item.completed') {
      const message =
        typeof item.message === 'string' && item.message.trim()
          ? item.message
          : 'codex reported a non-fatal error item';
      emitWarning({ message });
    }
  };
}

function extractMcpToolCallResult(item: CodexItem): unknown {
  if (
    item.result === undefined ||
    item.result === null ||
    typeof item.result !== 'object'
  ) {
    return item.error?.message ? { error: item.error.message } : null;
  }
  const result = item.result as {
    content?: unknown;
    structured_content?: unknown;
  };
  if (
    result.structured_content !== undefined &&
    result.structured_content !== null
  ) {
    return result.structured_content;
  }
  return result.content ?? null;
}

function mapUsage(usage: Record<string, number>): Record<string, unknown> {
  const input = usage.input_tokens ?? 0;
  const cacheRead = usage.cached_input_tokens ?? 0;
  return {
    inputTokens: {
      total: input,
      noCache: Math.max(0, input - cacheRead),
      cacheRead,
      cacheWrite: 0,
    },
    outputTokens: {
      total: usage.output_tokens ?? 0,
      text: usage.output_tokens ?? 0,
    },
  };
}
