import type {
  AgentSession,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import type { PiCompletedToolResult } from './pi-resume-state';

export type PiAgent = AgentSession['agent'];
type PiStreamFunction = PiAgent['streamFunction'];
type PiAssistantMessageStream = Awaited<ReturnType<PiStreamFunction>>;
export type PiAssistantMessage = Awaited<
  ReturnType<PiAssistantMessageStream['result']>
>;
type PiAgentTool = PiAgent['state']['tools'][number];
type PiSessionEntry = ReturnType<SessionManager['getBranch']>[number];

/**
 * Locate the most recent tool batch on the active journal branch so it can be
 * replayed: Pi's agent loop always starts with a model call and cannot resume
 * inside a tool batch. The journal leaf moves back to the entry before the
 * batch's assistant message; a replay then re-appends that message (via a
 * one-shot stream function) and lets Pi's executor run the batch again, with
 * already-known results short-circuited. The abandoned entries stay in the
 * journal as an inactive branch.
 *
 * Tool results that were already journaled after the assistant message are
 * returned so the replay reuses them instead of executing those calls again.
 */
export function takeToolBatchForReplay(input: { journal: SessionManager }):
  | {
      assistantMessage: PiAssistantMessage;
      journaledToolResults: PiCompletedToolResult[];
    }
  | undefined {
  const branch = input.journal.getBranch();
  const index = findLastIndex(branch, isAssistantToolBatchEntry);
  if (index < 0) return undefined;
  const entry = branch[index] as Extract<PiSessionEntry, { type: 'message' }>;
  const journaledToolResults: PiCompletedToolResult[] = [];
  for (const later of branch.slice(index + 1)) {
    if (later.type !== 'message') continue;
    const message = later.message as unknown as Record<string, unknown>;
    if (message.role !== 'toolResult') continue;
    if (typeof message.toolCallId !== 'string') continue;
    journaledToolResults.push({
      toolCallId: message.toolCallId,
      result: {
        content: Array.isArray(message.content) ? message.content : [],
        details: message.details,
      },
      isError: message.isError === true,
    });
  }
  if (entry.parentId == null) {
    input.journal.resetLeaf();
  } else {
    input.journal.branch(entry.parentId);
  }
  /*
   * The replayed message is not a new model call, so it reports no usage.
   * The original entry (now on the inactive branch) keeps the real usage.
   */
  const assistantMessage = structuredClone(
    entry.message,
  ) as unknown as PiAssistantMessage & { usage?: unknown };
  if (assistantMessage.usage != null) {
    assistantMessage.usage = zeroNumbers(assistantMessage.usage);
  }
  return { assistantMessage, journaledToolResults };
}

/**
 * Replay a tool batch on a Pi agent whose transcript ends right before the
 * batch's assistant message (see `takeToolBatchForReplay`). The first model
 * call returns the stored assistant message without contacting the model;
 * calls with a known result return it without executing and skip the
 * before/after tool hooks; every other call runs normally. Later model calls
 * of the same run go to the original stream function. The agent's original
 * stream function, tools and hooks are restored when the run ends.
 */
export async function runToolBatchReplay(input: {
  agent: PiAgent;
  assistantMessage: PiAssistantMessage;
  toolResults: ReadonlyMap<string, PiCompletedToolResult>;
  onReplayedMessage: () => void;
}): Promise<void> {
  const { agent, toolResults } = input;
  const streamFunction = agent.streamFunction;
  const tools = agent.state.tools;
  const beforeToolCall = agent.beforeToolCall;
  const afterToolCall = agent.afterToolCall;
  let replayed = false;

  agent.streamFunction = (model, context, options) => {
    if (replayed) return streamFunction(model, context, options);
    replayed = true;
    input.onReplayedMessage();
    return createReplayStream(input.assistantMessage);
  };
  agent.state.tools = tools.map(
    (tool): PiAgentTool => ({
      ...tool,
      execute: (toolCallId, params, signal, onUpdate) => {
        const stored = toolResults.get(toolCallId);
        if (stored == null) {
          return tool.execute(toolCallId, params, signal, onUpdate);
        }
        return Promise.resolve({
          content: [],
          details: undefined,
          ...stored.result,
          isError: stored.isError,
        } as Awaited<ReturnType<PiAgentTool['execute']>>);
      },
    }),
  );
  agent.beforeToolCall = async (context, signal) =>
    toolResults.has(context.toolCall.id)
      ? undefined
      : beforeToolCall?.(context, signal);
  agent.afterToolCall = async (context, signal) =>
    toolResults.has(context.toolCall.id)
      ? undefined
      : afterToolCall?.(context, signal);

  try {
    await agent.continue();
  } finally {
    agent.streamFunction = streamFunction;
    agent.state.tools = tools;
    agent.beforeToolCall = beforeToolCall;
    agent.afterToolCall = afterToolCall;
  }
}

function createReplayStream(
  message: PiAssistantMessage,
): PiAssistantMessageStream {
  const stream = {
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'done',
        reason: (message as { stopReason?: unknown }).stopReason,
        message,
      };
    },
    result: async () => message,
  };
  return stream as unknown as PiAssistantMessageStream;
}

function isAssistantToolBatchEntry(entry: PiSessionEntry): boolean {
  if (entry.type !== 'message') return false;
  const message = entry.message as unknown as Record<string, unknown>;
  return (
    message.role === 'assistant' &&
    Array.isArray(message.content) &&
    message.content.some(
      block =>
        block != null &&
        typeof block === 'object' &&
        (block as { type?: unknown }).type === 'toolCall',
    )
  );
}

function findLastIndex<T>(
  values: ReadonlyArray<T>,
  predicate: (value: T) => boolean,
): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index]!)) return index;
  }
  return -1;
}

function zeroNumbers<T>(value: T): T {
  if (typeof value === 'number') return 0 as T;
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, zeroNumbers(entry)]),
  ) as T;
}
