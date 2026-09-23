import { describe, expect, it, vi } from 'vitest';
import {
  createDynamicTools,
  handleAppServerRequest,
} from './codex-app-server-driver';

describe('Codex app-server dynamic tools', () => {
  it('preserves supported names and deterministically aliases invalid or reserved names', () => {
    const tools = [
      {
        name: 'get_weather',
        description: 'Get weather.',
        inputSchema: { type: 'object' },
      },
      {
        name: 'mcp__reserved',
        description: 'Reserved.',
        inputSchema: { type: 'object' },
      },
      {
        name: 'invalid.name',
        description: 'Invalid.',
        inputSchema: { type: 'object' },
      },
    ];

    const first = createDynamicTools(tools);
    const second = createDynamicTools(tools);
    const names = first.specs.map(spec => spec.name);

    expect(first.specs).toEqual(second.specs);
    expect(names[0]).toBe('get_weather');
    expect(names.slice(1)).toEqual([
      expect.stringMatching(/^ai_sdk_tool_[a-f0-9]{16}$/),
      expect.stringMatching(/^ai_sdk_tool_[a-f0-9]{16}$/),
    ]);
    expect(
      names.map(name => first.originalNameByAlias.get(String(name))),
    ).toEqual(tools.map(tool => tool.name));
  });

  it('uses an empty input schema when none is provided', () => {
    expect(createDynamicTools([{ name: 'no_args' }]).specs).toEqual([
      {
        type: 'function',
        name: 'no_args',
        description: '',
        inputSchema: {},
      },
    ]);
  });

  it('routes a tool request by call id and returns text output', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const dynamicTools = createDynamicTools([
      {
        name: 'get_weather',
        description: 'Get weather.',
        inputSchema: { type: 'object' },
      },
    ]);
    const requestToolResult = vi.fn(async () => ({
      output: { temperature: 21 },
    }));

    await expect(
      handleAppServerRequest({
        request: {
          id: 42,
          method: 'item/tool/call',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            callId: 'call-1',
            namespace: null,
            tool: 'get_weather',
            arguments: { city: 'Berlin' },
          },
        },
        dynamicTools,
        emit: event => emitted.push(event),
        requestToolResult,
      }),
    ).resolves.toEqual({
      contentItems: [{ type: 'inputText', text: '{"temperature":21}' }],
      success: true,
    });
    expect(requestToolResult).toHaveBeenCalledWith('call-1');
    expect(emitted).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'get_weather',
        input: '{"city":"Berlin"}',
        providerExecuted: false,
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'get_weather',
        result: { temperature: 21 },
        isError: false,
      },
    ]);
  });

  it('reports host tool errors through dynamic tool success', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const dynamicTools = createDynamicTools([
      {
        name: 'fail',
        inputSchema: { type: 'object' },
      },
    ]);

    await expect(
      handleAppServerRequest({
        request: {
          id: 'rpc-1',
          method: 'item/tool/call',
          params: {
            callId: 'call-1',
            tool: 'fail',
            arguments: {},
          },
        },
        dynamicTools,
        emit: event => emitted.push(event),
        requestToolResult: async () => ({
          output: 'failed',
          isError: true,
        }),
      }),
    ).resolves.toEqual({
      contentItems: [{ type: 'inputText', text: 'failed' }],
      success: false,
    });
    expect(emitted.at(-1)).toEqual({
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'fail',
      result: 'failed',
      isError: true,
    });
  });
});
