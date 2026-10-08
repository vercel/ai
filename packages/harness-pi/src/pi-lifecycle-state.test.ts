import { describe, expect, it } from 'vitest';
import {
  piLifecycleStateSchema,
  sessionEntriesOf,
  withSessionId,
  type PiSessionEntries,
} from './pi-lifecycle-state';

const header = {
  type: 'session',
  version: 3,
  id: 'session-1',
  timestamp: '2026-10-08T00:00:00.000Z',
  cwd: '/sandbox/work',
} as const;

const entry = {
  type: 'message',
  id: 'entry-1',
  parentId: null,
  timestamp: '2026-10-08T00:00:01.000Z',
  message: { role: 'user', content: 'hello', timestamp: 1 },
} as const;

const entries: PiSessionEntries = [header, entry];

describe('piLifecycleStateSchema', () => {
  it('accepts a header followed by entries', () => {
    expect(piLifecycleStateSchema.parse({ entries })).toEqual({ entries });
  });

  it.each([{}, { sessionFileName: 'pi-session.jsonl' }])(
    'reads %j as a state without entries',
    data => {
      expect(piLifecycleStateSchema.parse(data)).toEqual({});
    },
  );

  it('rejects entries without a header', () => {
    expect(piLifecycleStateSchema.safeParse({ entries: [entry] }).success).toBe(
      false,
    );
  });

  it('rejects an empty entry list', () => {
    expect(piLifecycleStateSchema.safeParse({ entries: [] }).success).toBe(
      false,
    );
  });
});

describe('withSessionId', () => {
  it('rewrites only the header id', () => {
    expect(withSessionId(entries, 'session-2')).toEqual([
      { ...header, id: 'session-2' },
      entry,
    ]);
    expect(header.id).toBe('session-1');
  });
});

describe('sessionEntriesOf', () => {
  it('puts the header before the entries', () => {
    expect(
      sessionEntriesOf({ getHeader: () => header, getEntries: () => [entry] }),
    ).toEqual(entries);
  });

  it('returns undefined without a header', () => {
    expect(
      sessionEntriesOf({ getHeader: () => null, getEntries: () => [] }),
    ).toBeUndefined();
  });
});
