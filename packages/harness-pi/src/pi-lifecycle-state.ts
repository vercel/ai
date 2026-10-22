import type {
  AgentSession,
  SessionEntry,
  SessionHeader,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import { isRecord } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * A whole Pi session: its header followed by its entries. Pi migrates the
 * entries according to the header's `version`, so the header is required.
 */
export type PiSessionEntries = readonly [SessionHeader, ...SessionEntry[]];

const piCompletedToolResultSchema = z.object({
  toolCallId: z.string(),
  result: z.looseObject({ content: z.array(z.unknown()).optional() }),
  isError: z.boolean(),
});

type PiAssistantMessageStream = Awaited<
  ReturnType<AgentSession['agent']['streamFunction']>
>;

type PiAgentAssistantMessage = Awaited<
  ReturnType<PiAssistantMessageStream['result']>
>;

export interface PiAssistantMessage extends PiAgentAssistantMessage {}

const piAssistantMessageShapeSchema = z.looseObject({
  role: z.literal('assistant'),
  content: z.array(z.unknown()),
});

/*
 * The parked assistant message is stored verbatim so it can be replayed into
 * Pi. Validation only checks the fields this adapter reads directly; the full
 * Pi message type is asserted at this lifecycle-state boundary so capture,
 * checkpointing and replay share one type.
 */
export const piAssistantMessageSchema = z.custom<PiAssistantMessage>(
  value => piAssistantMessageShapeSchema.safeParse(value).success,
  {
    error:
      'Pi pendingToolBatch.assistantMessage must be the parked assistant message. Tool batches parked by earlier harness-pi versions cannot be continued.',
  },
);

/**
 * A tool batch that was waiting on host input (tool results, approvals) when
 * its turn was persisted. Pi cannot resume in the middle of a batch, so a cold
 * continuation replays this host-held assistant message through Pi's tool
 * executor. Its tool calls must match the restored session before replay:
 * calls in `completedToolResults` reuse their stored result, while calls in
 * `awaitingToolCallIds` receive the host input delivered with the
 * continuation.
 */
const piPendingToolBatchSchema = z.object({
  assistantMessage: piAssistantMessageSchema,
  awaitingToolCallIds: z.array(z.string()),
  completedToolResults: z.array(piCompletedToolResultSchema),
  nativeApprovalDecisions: z.array(
    z.object({
      toolCallId: z.string(),
      approved: z.boolean(),
      reason: z.string().optional(),
    }),
  ),
});

export type PiPendingToolBatch = z.infer<typeof piPendingToolBatchSchema>;
export type PiCompletedToolResult = z.infer<typeof piCompletedToolResultSchema>;

const sessionHeaderSchema = z.custom<SessionHeader>(
  value =>
    isRecord(value) &&
    value.type === 'session' &&
    typeof value.id === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.cwd === 'string',
  'Pi session entries must start with a session header.',
);

export const sessionEntrySchema = z.custom<SessionEntry>(
  value =>
    isRecord(value) &&
    typeof value.type === 'string' &&
    value.type !== 'session',
  'Pi session entry must be an object with a type.',
);

export const piSessionEntriesSchema: z.ZodType<PiSessionEntries> = z.tuple(
  [sessionHeaderSchema],
  sessionEntrySchema,
);

export const piLifecycleStateSchema = z.preprocess(
  value => {
    /*
     * A pending tool batch is only replayed against a session restored from
     * `entries` or `leafId`. A state without either starts a fresh session and
     * ignores the batch, so a batch recorded by an earlier version, which has
     * no `assistantMessage`, is dropped here instead of failing validation.
     */
    if (!isRecord(value) || value.entries != null || value.leafId != null) {
      return value;
    }
    const { pendingToolBatch: _pendingToolBatch, ...rest } = value;
    return rest;
  },
  z.object({
    entries: piSessionEntriesSchema.optional(),
    leafId: z.string().optional(),
    pendingToolBatch: piPendingToolBatchSchema.optional(),
  }),
);

export type PiLifecycleData = z.infer<typeof piLifecycleStateSchema>;

export function sessionEntriesOf(
  manager: Pick<SessionManager, 'getHeader' | 'getEntries'>,
): PiSessionEntries | undefined {
  const header = manager.getHeader();
  return header == null ? undefined : [header, ...manager.getEntries()];
}

export function withSessionId(
  entries: PiSessionEntries,
  sessionId: string,
): PiSessionEntries {
  const [header, ...rest] = entries;
  return [{ ...header, id: sessionId }, ...rest];
}
