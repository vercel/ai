import type {
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

const piPendingToolBatchSchema = z.object({
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

/**
 * Lifecycle state `data` of the Pi harness. Without `entries` or `partIds` the
 * session starts fresh.
 */
export interface PiLifecycleData {
  readonly entries?: PiSessionEntries;
  /**
   * Ids of the parts of the session appended to the `sessionStorage` of
   * `createPi`, in order. Set instead of `entries` when a session storage is
   * configured.
   */
  readonly partIds?: ReadonlyArray<string>;
  /**
   * A tool batch that was waiting on host input when the turn was persisted.
   * Pi cannot resume in the middle of a batch, so the continuation replays it.
   */
  readonly pendingToolBatch?: PiPendingToolBatch;
}

const sessionHeaderSchema = z.custom<SessionHeader>(
  value =>
    isRecord(value) &&
    value.type === 'session' &&
    typeof value.id === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.cwd === 'string',
  'Pi session entries must start with a session header.',
);

const sessionEntrySchema = z.custom<SessionEntry>(
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

export const piLifecycleStateSchema: z.ZodType<PiLifecycleData> = z.object({
  entries: piSessionEntriesSchema.optional(),
  partIds: z.array(z.string()).min(1).optional(),
  pendingToolBatch: piPendingToolBatchSchema.optional(),
});

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
