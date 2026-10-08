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

/**
 * Lifecycle state `data` of the Pi harness. Without `entries` the session
 * starts fresh.
 */
export interface PiLifecycleData {
  readonly entries?: PiSessionEntries;
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

export const piLifecycleStateSchema: z.ZodType<PiLifecycleData> = z.object({
  entries: z.tuple([sessionHeaderSchema], sessionEntrySchema).optional(),
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
