import { asSchema } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { eventToolsFromDefinitions } from './mcp-event-tools';
import type { MCPEvent } from './mcp-events';

const event: MCPEvent = {
  name: 'issue.created',
  description: 'New issues in the selected project',
  delivery: ['webhook'],
  inputSchema: {
    type: 'object',
    properties: { project_id: { $ref: '#/$defs/projectId' } },
    $defs: { projectId: { type: 'string' } },
    required: ['project_id'],
    additionalProperties: false,
  },
  payloadSchema: {
    type: 'object',
    properties: { issue_id: { type: 'string' } },
  },
};
const options = { toolCallId: 'call-1', messages: [], context: {} };

describe('eventToolsFromDefinitions', () => {
  it('preserves the complete filter schema and keeps subscription results independent of payloadSchema', async () => {
    const subscribe = vi
      .fn()
      .mockResolvedValue({ id: 'watch-1', status: 'pending' });
    const tools = eventToolsFromDefinitions({ events: [event] }, { subscribe });
    const watch = tools.mcp_subscribe_issue_created;
    expect(watch.type).toBe('dynamic');
    expect(watch.description).toContain(event.description);
    expect(await asSchema(watch.inputSchema).jsonSchema).toEqual(
      event.inputSchema,
    );
    expect(watch.outputSchema).toBeUndefined();
    expect(subscribe).not.toHaveBeenCalled();
    expect(await watch.execute!({ project_id: 'ABC' }, options)).toEqual({
      id: 'watch-1',
      status: 'pending',
    });
    expect(subscribe).toHaveBeenCalledExactlyOnceWith(
      { name: 'issue.created', arguments: { project_id: 'ABC' } },
      options,
    );
  });

  it('filters delivery modes the webhook backend cannot service', () => {
    const tools = eventToolsFromDefinitions(
      {
        events: [
          { ...event, name: 'poll.only', delivery: ['poll'] },
          { ...event, name: 'push.only', delivery: ['push'] },
          { ...event, delivery: ['poll', 'push', 'webhook'] },
        ],
      },
      { subscribe: vi.fn() },
    );
    expect(Object.keys(tools)).toEqual(['mcp_subscribe_issue_created']);
  });

  it('keeps event identity bound outside model arguments', async () => {
    const subscribe = vi.fn();
    const tools = eventToolsFromDefinitions({ events: [event] }, { subscribe });
    const input = {
      name: 'different.event',
      delivery: { url: 'https://untrusted.example' },
      userId: 'other-user',
    };
    await tools.mcp_subscribe_issue_created.execute!(input, options);
    expect(subscribe).toHaveBeenCalledWith(
      { name: 'issue.created', arguments: input },
      options,
    );
    // Application code must validate/filter arguments; these fields never become routing options.
  });

  it('supports application namespaces, approval policy and execution context', async () => {
    const subscribe = vi.fn();
    const signal = new AbortController().signal;
    const executionOptions = {
      ...options,
      abortSignal: signal,
      context: { principal: 'trusted' },
    };
    const tools = eventToolsFromDefinitions(
      { events: [event] },
      {
        subscribe,
        toolName: () => 'issues__watch_created',
        needsApproval: true,
      },
    );
    expect(tools.issues__watch_created.needsApproval).toBe(true);
    await tools.issues__watch_created.execute!({}, executionOptions);
    expect(subscribe).toHaveBeenCalledWith(
      { name: event.name, arguments: {} },
      executionOptions,
    );
  });

  it('rejects name collisions rather than overwriting an event', () => {
    expect(() =>
      eventToolsFromDefinitions(
        { events: [event, { ...event, name: 'issue_created' }] },
        { subscribe: vi.fn() },
      ),
    ).toThrow('Duplicate event tool name');
    expect(() =>
      eventToolsFromDefinitions(
        { events: [event, { ...event, name: 'other' }] },
        { subscribe: vi.fn(), toolName: () => 'watch' },
      ),
    ).toThrow('Duplicate event tool name');
  });

  it.each(['', 'watch.event', 'x'.repeat(65)])(
    'rejects invalid model tool names (%s)',
    name => {
      expect(() =>
        eventToolsFromDefinitions(
          { events: [event] },
          { subscribe: vi.fn(), toolName: () => name },
        ),
      ).toThrow('Invalid generated event tool name');
    },
  );

  it('handles prototype-like names as ordinary own entries', () => {
    const tools = eventToolsFromDefinitions(
      { events: [event] },
      { subscribe: vi.fn(), toolName: () => '__proto__' },
    );
    expect(Object.getPrototypeOf(tools)).toBeNull();
    expect(Object.keys(tools)).toEqual(['__proto__']);
  });

  it('does not share tool definitions between authenticated catalogs', () => {
    const first = eventToolsFromDefinitions(
      { events: [event] },
      { subscribe: vi.fn() },
    );
    const second = eventToolsFromDefinitions(
      { events: [] },
      { subscribe: vi.fn() },
    );
    expect(Object.keys(first)).toHaveLength(1);
    expect(Object.keys(second)).toHaveLength(0);
  });

  it('does not execute aborted calls and propagates backend failures', async () => {
    const subscribe = vi
      .fn()
      .mockRejectedValue(new Error('authorization expired'));
    const watch = eventToolsFromDefinitions(
      { events: [event] },
      { subscribe },
    ).mcp_subscribe_issue_created;
    await expect(
      watch.execute!({}, { ...options, abortSignal: AbortSignal.abort() }),
    ).rejects.toThrow();
    expect(subscribe).not.toHaveBeenCalled();
    await expect(watch.execute!({}, options)).rejects.toThrow(
      'authorization expired',
    );
  });

  it.each([null, [], 'invalid', 1])(
    'rejects non-object arguments (%j)',
    async input => {
      const subscribe = vi.fn();
      const watch = eventToolsFromDefinitions(
        { events: [event] },
        { subscribe },
      ).mcp_subscribe_issue_created;
      await expect(watch.execute!(input, options)).rejects.toThrow(
        'must be an object',
      );
      expect(subscribe).not.toHaveBeenCalled();
    },
  );
});
