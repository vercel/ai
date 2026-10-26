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

  it('accepts a pending tool batch with its assistant message', () => {
    const pendingToolBatch = {
      assistantMessage: {
        role: 'assistant',
        content: [
          { type: 'toolCall', id: 'tool-1', name: 'askUser', arguments: {} },
        ],
      },
      awaitingToolCallIds: ['tool-1'],
      completedToolResults: [],
      nativeApprovalDecisions: [],
    };

    expect(piLifecycleStateSchema.parse({ entries, pendingToolBatch })).toEqual(
      { entries, pendingToolBatch },
    );
  });

  it('rejects a legacy pending tool batch without its assistant message', () => {
    const result = piLifecycleStateSchema.safeParse({
      entries,
      pendingToolBatch: {
        awaitingToolCallIds: ['tool-1'],
        completedToolResults: [],
        nativeApprovalDecisions: [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchInlineSnapshot(`
      [
        {
          "code": "custom",
          "message": "Pi pendingToolBatch.assistantMessage must be the parked assistant message. Tool batches parked by earlier harness-pi versions cannot be continued.",
          "path": [
            "pendingToolBatch",
            "assistantMessage",
          ],
        },
      ]
    `);
  });

  it('rejects a pending tool batch with a non-assistant message', () => {
    expect(
      piLifecycleStateSchema.safeParse({
        leafId: 'entry-1',
        pendingToolBatch: {
          assistantMessage: { role: 'user', content: [] },
          awaitingToolCallIds: ['tool-1'],
          completedToolResults: [],
          nativeApprovalDecisions: [],
        },
      }).success,
    ).toBe(false);
  });

  it('drops a legacy pending tool batch from a state without a session to replay it against', () => {
    expect(
      piLifecycleStateSchema.parse({
        sessionFileName: 'pi-session.jsonl',
        pendingToolBatch: {
          awaitingToolCallIds: ['tool-1'],
          completedToolResults: [],
          nativeApprovalDecisions: [],
        },
      }),
    ).toEqual({});
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
