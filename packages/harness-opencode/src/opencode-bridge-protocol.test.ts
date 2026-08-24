import { describe, expect, it } from 'vitest';
import {
  inboundMessageSchema,
  outboundMessageSchema,
} from './opencode-bridge-protocol';

describe('OpenCode bridge protocol', () => {
  it('accepts prompt and compact start operations', () => {
    expect(
      inboundMessageSchema.parse({
        type: 'start',
        operation: 'prompt',
        prompt: 'hi',
        tools: [],
        variant: 'high',
      }),
    ).toMatchInlineSnapshot(`
      {
        "operation": "prompt",
        "prompt": "hi",
        "tools": [],
        "type": "start",
        "variant": "high",
      }
    `);

    expect(
      inboundMessageSchema.parse({
        type: 'start',
        operation: 'compact',
        prompt: '',
        resumeSessionId: 'ses_123',
      }),
    ).toMatchInlineSnapshot(`
      {
        "operation": "compact",
        "prompt": "",
        "resumeSessionId": "ses_123",
        "type": "start",
      }
    `);
  });

  it('accepts shared bridge commands', () => {
    expect(inboundMessageSchema.parse({ type: 'abort' })).toEqual({
      type: 'abort',
    });
    expect(inboundMessageSchema.parse({ type: 'stop' })).toEqual({
      type: 'stop',
    });
    expect(inboundMessageSchema.parse({ type: 'destroy' })).toEqual({
      type: 'destroy',
    });
    expect(
      inboundMessageSchema.parse({
        type: 'tool-result',
        toolCallId: 'tool-1',
        output: { ok: true },
      }),
    ).toEqual({
      type: 'tool-result',
      toolCallId: 'tool-1',
      output: { ok: true },
    });
    expect(inboundMessageSchema.parse({ type: 'export-session' })).toEqual({
      type: 'export-session',
    });
  });

  it('accepts importEvents on the start message', () => {
    expect(
      inboundMessageSchema.parse({
        type: 'start',
        prompt: 'hi',
        importEvents: [
          {
            id: 'evt_1',
            aggregate_id: 'ses_1',
            seq: 1,
            type: 'session.created',
            data: { id: 'ses_1' },
          },
        ],
      }),
    ).toEqual({
      type: 'start',
      prompt: 'hi',
      importEvents: [
        {
          id: 'evt_1',
          aggregate_id: 'ses_1',
          seq: 1,
          type: 'session.created',
          data: { id: 'ses_1' },
        },
      ],
    });
  });

  it('validates bridge-export replies', () => {
    expect(
      outboundMessageSchema.parse({
        type: 'bridge-export',
        data: { openCodeSessionId: 'ses_1', syncEvents: [] },
      }),
    ).toEqual({
      type: 'bridge-export',
      data: { openCodeSessionId: 'ses_1', syncEvents: [] },
    });
    expect(
      outboundMessageSchema.parse({
        type: 'bridge-export',
        error: { message: 'no session' },
      }),
    ).toEqual({
      type: 'bridge-export',
      error: { message: 'no session' },
    });
  });
});
