import { describe, expect, it } from 'vitest';
import { openai } from '../index';

const model = openai.experimental_live('gpt-live-1');

describe('Live delegated backend events through the public provider', () => {
  it('exposes Responses delegation metadata while preserving opaque IDs', () => {
    const raw = {
      type: 'session.delegation.created',
      offset_ms: 125,
      delegation: {
        id: 'item_opaque',
        target: 'responses',
        response_id: 'resp_opaque',
      },
    };
    expect(model.parseServerEvent(raw)).toEqual([
      {
        type: 'delegation-created',
        delegationId: 'item_opaque',
        target: 'provider',
        offsetMs: 125,
        responseId: 'resp_opaque',
        raw,
      },
    ]);
  });

  it.each(['delegation-1', null, undefined])(
    'emits the raw envelope before response-created (%s)',
    delegationId => {
      const event = {
        type: 'response.created',
        response: { id: 'resp-1', output: [], tools: [], instructions: null },
      };
      const raw = {
        type: 'response.event',
        delegation_id: delegationId,
        event,
        extra: 'preserved',
      };
      const parsed = model.parseServerEvent(raw);
      expect(parsed).toEqual([
        { type: 'backend-event', event, delegationId, raw },
        {
          type: 'backend-response-created',
          responseId: 'resp-1',
          delegationId,
          raw,
        },
      ]);
      if (!Array.isArray(parsed)) throw new Error('Expected ordered events');
      expect(parsed[0].raw).toBe(raw);
      expect(parsed[1].raw).toBe(raw);
    },
  );

  it('uses the function call ID, not the output item ID, and retains nested details', () => {
    const event = {
      type: 'response.output_item.done',
      response_id: 'resp-1',
      output_index: 0,
      item: {
        type: 'function_call',
        id: 'fc-1',
        call_id: 'call-1',
        name: 'lookup',
        arguments: '{"id":42}',
        status: 'completed',
      },
    };
    const raw = {
      type: 'response.event',
      delegation_id: 'delegation-1',
      event,
    };
    expect(model.parseServerEvent(raw)).toEqual([
      { type: 'backend-event', event, delegationId: 'delegation-1', raw },
      {
        type: 'backend-tool-call',
        responseId: 'resp-1',
        delegationId: 'delegation-1',
        callId: 'call-1',
        name: 'lookup',
        arguments: '{"id":42}',
        raw,
      },
    ]);
  });

  it.each(['completed', 'failed', 'incomplete', 'cancelled'])(
    'normalizes %s with cumulative token usage and empty output',
    status => {
      const usage = {
        input_tokens: 20,
        output_tokens: 5,
        total_tokens: 25,
        input_tokens_details: { cached_tokens: 10 },
        output_tokens_details: { reasoning_tokens: 3 },
      };
      const event = {
        type: `response.${status}`,
        response: {
          id: 'resp-1',
          status,
          output: [],
          usage,
          error: status === 'failed' ? { code: 'server_error' } : null,
        },
      };
      const raw = { type: 'response.event', event };
      const parsed = model.parseServerEvent(raw);
      expect(parsed).toEqual([
        { type: 'backend-event', event, delegationId: undefined, raw },
        {
          type: 'backend-response-done',
          responseId: 'resp-1',
          delegationId: undefined,
          status,
          usage: {
            inputTokens: 20,
            outputTokens: 5,
            totalTokens: 25,
            cachedInputTokens: 10,
            raw: usage,
          },
          raw,
        },
      ]);
      if (!Array.isArray(parsed) || parsed[1].type !== 'backend-response-done')
        throw new Error('Expected completion');
      expect(parsed[1].usage?.raw).toBe(usage);
      expect(parsed[1].raw).toBe(raw);
    },
  );

  it.each([
    undefined,
    null,
    { input_tokens: 1 },
    { input_tokens: -1, output_tokens: 0, total_tokens: 0 },
  ])('keeps completion when optional usage cannot be normalized: %j', usage => {
    const raw = {
      type: 'response.event',
      event: {
        type: 'response.completed',
        response: { id: 'resp-1', status: 'completed', output: [], usage },
      },
    };
    expect(model.parseServerEvent(raw)).toEqual([
      { type: 'backend-event', event: raw.event, delegationId: undefined, raw },
      {
        type: 'backend-response-done',
        responseId: 'resp-1',
        delegationId: undefined,
        status: 'completed',
        raw,
      },
    ]);
  });

  it.each([
    {
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        id: 'fc-1',
        call_id: 'call-1',
        name: 'lookup',
        arguments: '{}',
      },
    },
    {
      type: 'response.output_item.done',
      response_id: '',
      item: {
        type: 'function_call',
        call_id: 'call-1',
        name: 'lookup',
        arguments: '{}',
      },
    },
    {
      type: 'response.output_item.done',
      response_id: 'resp-1',
      item: { type: 'message', id: 'msg-1', content: [] },
    },
    {
      type: 'response.output_item.done',
      response_id: 'resp-1',
      item: {
        type: 'function_call',
        id: 'fc-1',
        name: 'lookup',
        arguments: '{}',
      },
    },
    {
      type: 'response.function_call_arguments.done',
      response_id: 'resp-1',
      item_id: 'fc-1',
      call_id: 'call-1',
      name: 'lookup',
      arguments: '{}',
    },
    { type: 'response.created', response: {} },
    { type: 'response.completed', response: { status: 'completed' } },
    { type: 'response.future', extra: { keep: true } },
    { type: 'error', code: 'new_error', message: 'Unknown backend error' },
  ])(
    'preserves raw without inventing lifecycle or tool calls for %j',
    event => {
      // Even a previous lifecycle event must not associate an uncorrelated tool call.
      model.parseServerEvent({
        type: 'response.event',
        delegation_id: 'delegation-1',
        event: {
          type: 'response.created',
          response: { id: 'previous-response' },
        },
      });
      const raw = {
        type: 'response.event',
        delegation_id: 'delegation-1',
        event,
      };
      expect(model.parseServerEvent(raw)).toEqual([
        { type: 'backend-event', event, delegationId: 'delegation-1', raw },
      ]);
    },
  );
});
