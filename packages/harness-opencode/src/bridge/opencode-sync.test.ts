import { describe, expect, it } from 'vitest';
import {
  normalizeSyncHistory,
  readReplaySessionId,
  toReplayEvents,
} from './opencode-sync';

const historyEvent = {
  id: 'evt_1',
  aggregate_id: 'ses_1',
  seq: 1,
  type: 'session.created',
  data: { id: 'ses_1' },
};

describe('normalizeSyncHistory', () => {
  it('passes through a bare event array', () => {
    expect(normalizeSyncHistory([historyEvent])).toEqual([historyEvent]);
  });

  it('unwraps a wrapped { data } response', () => {
    expect(normalizeSyncHistory({ data: [historyEvent] })).toEqual([
      historyEvent,
    ]);
  });

  it('returns an empty array for unexpected shapes', () => {
    expect(normalizeSyncHistory(undefined)).toEqual([]);
    expect(normalizeSyncHistory(null)).toEqual([]);
    expect(normalizeSyncHistory({ data: 'nope' })).toEqual([]);
    expect(normalizeSyncHistory('nope')).toEqual([]);
  });
});

describe('toReplayEvents', () => {
  it('renames aggregate_id to aggregateID for the replay request', () => {
    expect(toReplayEvents([historyEvent])).toEqual([
      {
        id: 'evt_1',
        aggregateID: 'ses_1',
        seq: 1,
        type: 'session.created',
        data: { id: 'ses_1' },
      },
    ]);
  });

  it('defaults a missing data object to an empty record', () => {
    const event = { ...historyEvent, data: undefined } as never;
    expect(toReplayEvents([event])[0].data).toEqual({});
  });
});

describe('readReplaySessionId', () => {
  it('reads the sessionID field', () => {
    expect(readReplaySessionId({ sessionID: 'ses_1' })).toBe('ses_1');
  });

  it('falls back to id', () => {
    expect(readReplaySessionId({ id: 'ses_1' })).toBe('ses_1');
  });

  it('rejects empty and malformed values', () => {
    expect(readReplaySessionId({ sessionID: '' })).toBeUndefined();
    expect(readReplaySessionId({ sessionID: 42 })).toBeUndefined();
    expect(readReplaySessionId(undefined)).toBeUndefined();
  });
});
