import { describe, expect, it, vi } from 'vitest';
import { createOpenAI } from '../index';

const model = createOpenAI({ apiKey: 'test-key' }).experimental_live(
  'gpt-live-1',
);

function created(responseId: string, delegationId?: string | null) {
  return {
    type: 'response.event',
    delegation_id: delegationId,
    event: {
      type: 'response.created',
      response: { id: responseId, output: [] },
    },
  };
}

function tool(delegationId?: string | null, responseId?: string | null) {
  return {
    type: 'response.event',
    delegation_id: delegationId,
    event: {
      type: 'response.output_item.done',
      response_id: responseId,
      output_index: 0,
      item: {
        type: 'function_call',
        id: 'fc-1',
        call_id: 'call-1',
        name: 'lookup',
        arguments: '{"orderId":"123"}',
      },
    },
  };
}

function done(
  responseId: string,
  delegationId?: string | null,
  status = 'completed',
) {
  return {
    type: 'response.event',
    delegation_id: delegationId,
    event: {
      type: `response.${status}`,
      response: { id: responseId, status, output: [] },
    },
  };
}

function expectRawOnly(
  parse: ReturnType<typeof model.createServerEventParser>,
  raw: ReturnType<typeof tool>,
) {
  expect(parse(raw)).toEqual([
    {
      type: 'backend-event',
      event: raw.event,
      delegationId: raw.delegation_id,
      raw,
    },
  ]);
}

describe('OpenAI Live connection-local parser', () => {
  it('correlates interleaved delegations and preserves both raw envelopes and nested items', () => {
    const parse = model.createServerEventParser();
    parse(created('resp-a', 'delegation-a'));
    parse(created('resp-b', 'delegation-b'));
    for (const suffix of ['b', 'a']) {
      const raw = tool(`delegation-${suffix}`);
      const parsed = parse(raw);
      expect(parsed).toEqual([
        {
          type: 'backend-event',
          event: raw.event,
          delegationId: `delegation-${suffix}`,
          raw,
        },
        {
          type: 'backend-tool-call',
          responseId: `resp-${suffix}`,
          delegationId: `delegation-${suffix}`,
          callId: 'call-1',
          name: 'lookup',
          arguments: '{"orderId":"123"}',
          raw,
        },
      ]);
      if (!Array.isArray(parsed)) throw new Error('Expected ordered events');
      expect(parsed[0].raw).toBe(raw);
      expect(parsed[1].raw).toBe(raw);
      expect(raw.event.response_id).toBeUndefined();
    }
    expectRawOnly(parse, tool('unknown'));
  });

  it('isolates two parsers on the same model and keeps the stateless method independent', () => {
    const first = model.createServerEventParser();
    const second = model.createServerEventParser();
    first(created('resp-first', 'shared-delegation'));
    expectRawOnly(second, tool('shared-delegation'));
    second(created('resp-second', 'shared-delegation'));
    expect(first(tool('shared-delegation'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-first',
      }),
    );
    expect(second(tool('shared-delegation'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-second',
      }),
    );
    expectRawOnly(
      raw => model.parseServerEvent(raw),
      tool('shared-delegation'),
    );
  });

  it('uses explicit response IDs without rewriting or teaching another association', () => {
    const parse = model.createServerEventParser();
    parse(created('resp-active', 'delegation-a'));
    expect(parse(tool('delegation-a', 'resp-explicit'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-explicit',
      }),
    );
    expect(parse(tool('delegation-a'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-active',
      }),
    );
    expect(parse(tool('unknown', 'resp-explicit'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-explicit',
      }),
    );
    expectRawOnly(parse, tool('unknown'));
  });

  it.each([null, undefined])(
    'requires explicit response IDs for uncorrelated envelopes (%s)',
    delegationId => {
      const parse = model.createServerEventParser();
      parse(created('resp-manual', delegationId));
      parse(created('resp-other', 'known-delegation'));
      expectRawOnly(parse, tool(delegationId));
      expect(parse(tool(delegationId, 'resp-manual'))).toContainEqual(
        expect.objectContaining({
          type: 'backend-tool-call',
          responseId: 'resp-manual',
        }),
      );
    },
  );

  it('does not choose between overlapping responses for one delegation', () => {
    const parse = model.createServerEventParser();
    parse(created('resp-a', 'delegation'));
    parse(created('resp-b', 'delegation'));
    expectRawOnly(parse, tool('delegation'));
    expect(parse(tool('delegation', 'resp-a'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-a',
      }),
    );
    parse(done('resp-a', 'delegation'));
    expect(parse(tool('delegation'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-b',
      }),
    );
    // A delayed duplicate terminal for A cannot delete B's association.
    parse(done('resp-a', 'delegation'));
    expect(parse(tool('delegation'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-b',
      }),
    );
  });

  it.each(['completed', 'failed', 'incomplete', 'cancelled'])(
    'cleans up %s even without an outer delegation ID',
    status => {
      const parse = model.createServerEventParser();
      parse(created('resp-a', 'delegation-a'));
      parse(created('resp-b', 'delegation-b'));
      expect(parse(done('resp-a', undefined, status))).toContainEqual(
        expect.objectContaining({
          type: 'backend-response-done',
          responseId: 'resp-a',
          status,
        }),
      );
      expectRawOnly(parse, tool('delegation-a'));
      expect(parse(tool('delegation-b'))).toContainEqual(
        expect.objectContaining({
          type: 'backend-tool-call',
          responseId: 'resp-b',
        }),
      );
    },
  );

  it('leaves delayed or pre-lifecycle events raw instead of buffering or guessing', () => {
    const parse = model.createServerEventParser();
    expectRawOnly(parse, tool('delegation'));
    parse(created('resp-a', 'delegation'));
    parse(done('resp-a', 'delegation'));
    expectRawOnly(parse, tool('delegation'));
    // An explicitly identified late event retains its own identity.
    expect(parse(tool('delegation', 'resp-a'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-a',
      }),
    );
  });

  it('resets on session starts and close, and does not relearn from events after close', () => {
    const parse = model.createServerEventParser();
    parse(created('resp-a', 'delegation'));
    parse({ type: 'session.started', session: { id: 'new-session' } });
    expectRawOnly(parse, tool('delegation'));
    parse(created('resp-b', 'delegation'));
    parse({
      type: 'session.closed',
      session: { id: 'new-session' },
      reason: 'close_requested',
      usage: { seconds: 1 },
    });
    expectRawOnly(parse, tool('delegation'));
    parse(created('late-response', 'delegation'));
    expectRawOnly(parse, tool('delegation'));
    parse({ type: 'session.started', session: { id: 'third-session' } });
    parse(created('resp-c', 'delegation'));
    expect(parse(tool('delegation'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-c',
      }),
    );
  });

  it('preserves unknown events without changing correlation', () => {
    const parse = model.createServerEventParser();
    parse(created('resp-a', 'delegation'));
    const raw = { type: 'future.event', payload: { future: true } };
    expect(parse(raw)).toEqual([
      {
        type: 'custom',
        rawType: 'future.event',
        raw,
      },
    ]);
    const nested = {
      type: 'response.event',
      delegation_id: 'delegation',
      event: { type: 'response.future', response_id: 'other-response' },
    };
    expect(parse(nested)).toEqual([
      {
        type: 'backend-event',
        delegationId: 'delegation',
        event: nested.event,
        raw: nested,
      },
    ]);
    expect(parse(tool('delegation'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-a',
      }),
    );
  });

  it('bounds active associations, reports overflow, and fails closed until reset', () => {
    const parse = model.createServerEventParser();
    for (let i = 0; i < 512; i++)
      parse(created(`resp-${i}`, `delegation-${i}`));
    expect(parse(created('resp-0', 'delegation-0'))).toHaveLength(2);
    expect(parse(tool('delegation-0'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-0',
      }),
    );
    const overflow = created('resp-overflow', 'delegation-overflow');
    expect(parse(overflow)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'backend_correlation_limit',
        raw: overflow,
      }),
    );
    expectRawOnly(parse, tool('delegation-overflow'));
    expectRawOnly(parse, tool('delegation-0'));
    expect(parse(tool('delegation-0', 'resp-0'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-0',
      }),
    );
    parse({ type: 'session.started', session: { id: 'new-session' } });
    parse(created('resp-new', 'delegation-new'));
    expect(parse(tool('delegation-new'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-new',
      }),
    );
  });

  it('reclaims terminal entries so long sessions do not exhaust the bound', () => {
    const parse = model.createServerEventParser();
    for (let i = 0; i < 600; i++) {
      expect(parse(created(`resp-${i}`, `delegation-${i}`))).toHaveLength(2);
      parse(done(`resp-${i}`, `delegation-${i}`));
    }
    parse(created('resp-last', 'delegation-last'));
    expect(parse(tool('delegation-last'))).toContainEqual(
      expect.objectContaining({
        type: 'backend-tool-call',
        responseId: 'resp-last',
      }),
    );
  });

  it('runs a headless custom tool round trip through the public provider without browser globals', () => {
    vi.stubGlobal('WebSocket', undefined);
    vi.stubGlobal('RTCPeerConnection', undefined);
    vi.stubGlobal('window', undefined);
    try {
      const parse = model.createServerEventParser();
      expect(model.getServerWebSocketConfig().headers.authorization).toBe(
        'Bearer test-key',
      );
      parse(created('resp-a', 'delegation'));
      const events = parse(tool('delegation'));
      if (!Array.isArray(events)) throw new Error('Expected ordered events');
      const call = events.find(event => event.type === 'backend-tool-call');
      if (call?.type !== 'backend-tool-call')
        throw new Error('Expected tool call');
      const execute = vi.fn<(name: string, argumentsText: string) => string>(
        () => '{"status":"shipped"}',
      );
      const output = execute(call.name, call.arguments);
      expect(
        model.serializeClientEvent({
          type: 'backend-tool-result',
          callId: call.callId,
          output,
        }),
      ).toEqual({
        type: 'response.item.create',
        item: { type: 'function_call_output', call_id: 'call-1', output },
      });
      expect(
        model.serializeClientEvent({ type: 'backend-response-create' }),
      ).toEqual({ type: 'response.create' });
      expect(parse(done('resp-a', 'delegation'))).toContainEqual(
        expect.objectContaining({
          type: 'backend-response-done',
          responseId: 'resp-a',
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('resolved session delegation mode', () => {
  it.each([
    [undefined, 'client'],
    [null, 'client'],
    [{ type: 'client' }, 'client'],
    [{ type: 'responses', responses: { model: 'backend' } }, 'provider'],
  ])(
    'normalizes %j as %s on both parser paths',
    (delegation, delegationMode) => {
      const raw = {
        type: 'session.started',
        session: { id: 'session-1', delegation },
      };
      for (const parse of [
        model.createServerEventParser(),
        (raw: unknown) => model.parseServerEvent(raw),
      ]) {
        expect(parse(raw)).toEqual([
          {
            type: 'session-started',
            sessionId: 'session-1',
            delegationMode,
            raw,
          },
        ]);
      }
    },
  );

  it('does not infer a mode from malformed configuration', () => {
    expect(
      model.createServerEventParser()({
        type: 'session.started',
        session: { id: 'session-1', delegation: { type: 'future-mode' } },
      }),
    ).toMatchObject([{ type: 'error', code: 'invalid_server_event' }]);
  });
});
