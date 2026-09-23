import { describe, expect, it, vi } from 'vitest';
import {
  assertCodexThreadPermissions,
  createCodexAppServerArgs,
  createDynamicTools,
  createThreadParams,
  createTurnParams,
  handleAppServerRequest,
} from './codex-app-server-driver';
import type { StartMessage } from '../codex-bridge-protocol';

describe('Codex app-server sandbox configuration', () => {
  const start = {
    prompt: 'Inspect the parent directory.',
    reasoningEffort: 'high',
    responseFormat: {
      type: 'json',
      schema: { type: 'object' },
    },
    webSearch: true,
  } as StartMessage;

  it('disables the Codex sandbox before app-server startup', () => {
    expect(createCodexAppServerArgs().slice(1)).toEqual([
      '--config',
      'sandbox_mode="danger-full-access"',
      '--config',
      'approval_policy="never"',
      'app-server',
      '--stdio',
    ]);
  });

  it('disables the Codex sandbox when starting or resuming a thread', () => {
    expect(
      createThreadParams({
        start,
        workdir: '/workspace',
        codexModel: 'gpt-5.3-codex',
        codexConfig: { model_reasoning_summary: 'detailed' },
      }),
    ).toEqual({
      model: 'gpt-5.3-codex',
      cwd: '/workspace',
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
      config: {
        model_reasoning_summary: 'detailed',
        web_search: 'live',
      },
    });
  });

  it('declares the HarnessAgent sandbox as the only sandbox for every turn', () => {
    expect(
      createTurnParams({
        threadId: 'thread-1',
        start,
        codexModel: 'gpt-5.3-codex',
      }),
    ).toEqual({
      threadId: 'thread-1',
      input: [
        {
          type: 'text',
          text: 'Inspect the parent directory.',
          text_elements: [],
        },
      ],
      approvalPolicy: 'never',
      sandboxPolicy: {
        type: 'externalSandbox',
        networkAccess: 'enabled',
      },
      model: 'gpt-5.3-codex',
      effort: 'high',
      outputSchema: { type: 'object' },
    });
  });

  it('fails before a turn if Codex did not disable its sandbox', () => {
    expect(() =>
      assertCodexThreadPermissions({
        response: {
          approvalPolicy: 'never',
          sandbox: { type: 'workspaceWrite' },
        },
        method: 'thread/start',
      }),
    ).toThrow(
      'Codex app-server thread/start did not disable approvals and its platform sandbox.',
    );
  });

  it('accepts the disabled thread policy returned by Codex', () => {
    expect(() =>
      assertCodexThreadPermissions({
        response: {
          approvalPolicy: 'never',
          sandbox: { type: 'dangerFullAccess' },
        },
        method: 'thread/start',
      }),
    ).not.toThrow();
  });
});

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
