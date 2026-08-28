import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import type { ACPToolCall } from '../../acp-tool-call';
import {
  createACPStreamTranslator,
  mapACPFinishReason,
} from './stream-translator';

describe('createACPStreamTranslator', () => {
  it('orders reasoning and text blocks with and without message IDs', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
    });

    translator.update({
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'First' },
      messageId: 'reason-1',
    });
    translator.update({
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: ' thought' },
      messageId: 'reason-1',
    });
    translator.update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Answer' },
    });
    translator.update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: ' continued' },
    });
    translator.finish({
      stopReason: 'end_turn',
      usage: {
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
      },
    });

    expect(withoutRaw({ events })).toMatchInlineSnapshot(`
      [
        {
          "id": "reason-1",
          "type": "reasoning-start",
        },
        {
          "delta": "First",
          "id": "reason-1",
          "type": "reasoning-delta",
        },
        {
          "delta": " thought",
          "id": "reason-1",
          "type": "reasoning-delta",
        },
        {
          "id": "reason-1",
          "type": "reasoning-end",
        },
        {
          "id": "acp-text-1",
          "type": "text-start",
        },
        {
          "delta": "Answer",
          "id": "acp-text-1",
          "type": "text-delta",
        },
        {
          "delta": " continued",
          "id": "acp-text-1",
          "type": "text-delta",
        },
        {
          "id": "acp-text-1",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "end_turn",
            "unified": "stop",
          },
          "harnessMetadata": {
            "acp": {
              "inferredStep": true,
            },
          },
          "type": "finish-step",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": undefined,
              "total": undefined,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": undefined,
            },
          },
        },
        {
          "finishReason": {
            "raw": "end_turn",
            "unified": "stop",
          },
          "harnessMetadata": {
            "acp": {
              "stopReason": "end_turn",
              "usage": {
                "inputTokens": 4,
                "outputTokens": 2,
                "totalTokens": 6,
              },
            },
          },
          "totalUsage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": undefined,
              "total": 4,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": 2,
            },
            "raw": {
              "inputTokens": 4,
              "outputTokens": 2,
              "totalTokens": 6,
            },
          },
          "type": "finish",
        },
      ]
    `);
  });

  it('matches only an authoritative programmatic name to a key or nativeName', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [
        { toolName: 'bash', nativeName: 'shell' },
        { toolName: 'webSearch' },
      ],
    });

    translator.update({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-key',
        title: 'Display title',
        status: 'completed',
        rawInput: { query: 'ACP' },
      },
      rawUpdate: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-key',
        title: 'Display title',
        status: 'completed',
        rawInput: { query: 'ACP' },
        name: 'webSearch',
      },
    });
    translator.update({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-native',
        title: 'Display title',
        status: 'completed',
        rawInput: { command: 'pwd' },
      },
      rawUpdate: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-native',
        title: 'Display title',
        status: 'completed',
        rawInput: { command: 'pwd' },
        name: 'shell',
      },
    });

    expect(toolEvents({ events })).toMatchInlineSnapshot(`
      [
        {
          "input": "{"query":"ACP"}",
          "providerExecuted": true,
          "toolCallId": "call-key",
          "toolName": "webSearch",
          "type": "tool-call",
        },
        {
          "result": {},
          "toolCallId": "call-key",
          "toolName": "webSearch",
          "type": "tool-result",
        },
        {
          "input": "{"command":"pwd"}",
          "nativeName": "shell",
          "providerExecuted": true,
          "toolCallId": "call-native",
          "toolName": "bash",
          "type": "tool-call",
        },
        {
          "result": {},
          "toolCallId": "call-native",
          "toolName": "bash",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('matches a configured native name from ACP metadata', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [{ toolName: 'bash', nativeName: 'Bash' }],
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-claude',
      title: 'Run command',
      status: 'completed',
      rawInput: { command: 'pwd' },
      _meta: { claudeCode: { toolName: 'Bash' } },
    });

    expect(toolEvents({ events })).toMatchInlineSnapshot(`
      [
        {
          "input": "{\"command\":\"pwd\"}",
          "nativeName": "Bash",
          "providerExecuted": true,
          "toolCallId": "call-claude",
          "toolName": "bash",
          "type": "tool-call",
        },
        {
          "result": {},
          "toolCallId": "call-claude",
          "toolName": "bash",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('waits for a pending ACP tool call to receive its complete input', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [
        {
          toolName: 'bash',
          nativeName: 'Bash',
          inputSchema: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command'],
          },
        },
      ],
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-streaming',
      title: 'Run command',
      status: 'pending',
      rawInput: {},
      _meta: { claudeCode: { toolName: 'Bash' } },
    });
    expect(toolEvents({ events })).toEqual([]);

    translator.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-streaming',
      rawInput: { command: 'pwd' },
      _meta: { claudeCode: { toolName: 'Bash' } },
    });

    expect(toolEvents({ events })).toMatchInlineSnapshot(`
      [
        {
          "input": "{\"command\":\"pwd\"}",
          "nativeName": "Bash",
          "providerExecuted": true,
          "toolCallId": "call-streaming",
          "toolName": "bash",
          "type": "tool-call",
        },
      ]
    `);
  });

  it('buffers partial input updates for a recognized built-in tool', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [
        {
          toolName: 'write',
          nativeName: 'Write',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['file_path', 'content'],
          },
        },
      ],
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-write',
      title: 'Write file',
      status: 'pending',
      rawInput: {},
      _meta: { claudeCode: { toolName: 'Write' } },
    });
    translator.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-write',
      rawInput: { file_path: 'app/page.tsx' },
      _meta: { claudeCode: { toolName: 'Write' } },
    });

    expect(toolEvents({ events })).toEqual([]);

    translator.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-write',
      rawInput: {
        file_path: 'app/page.tsx',
        content: 'export default function Page() {}',
      },
      _meta: { claudeCode: { toolName: 'Write' } },
    });

    expect(toolEvents({ events })).toMatchInlineSnapshot(`
      [
        {
          "input": "{\"file_path\":\"app/page.tsx\",\"content\":\"export default function Page() {}\"}",
          "nativeName": "Write",
          "providerExecuted": true,
          "toolCallId": "call-write",
          "toolName": "write",
          "type": "tool-call",
        },
      ]
    `);
  });

  it('emits permission tool calls before their approval request', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [{ toolName: 'bash', nativeName: 'Bash' }],
    });

    translator.permissionToolCall({
      toolCall: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call-permission',
        title: 'Run command',
        status: 'pending',
        rawInput: { command: 'pwd' },
        _meta: { claudeCode: { toolName: 'Bash' } },
      },
    });

    expect(toolEvents({ events })[0]).toMatchInlineSnapshot(`
      {
        "input": "{\"command\":\"pwd\"}",
        "nativeName": "Bash",
        "providerExecuted": true,
        "toolCallId": "call-permission",
        "toolName": "bash",
        "type": "tool-call",
      }
    `);
  });

  it('matches exactly one built-in input schema when ACP omits a name', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [
        {
          toolName: 'bash',
          nativeName: 'shell',
          inputSchema: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command'],
          },
        },
        {
          toolName: 'webSearch',
          nativeName: 'web_search',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      ],
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-codex',
      title: 'Run command',
      status: 'completed',
      rawInput: { command: 'pwd', cwd: '/workspace' },
    });

    expect(toolEvents({ events })).toMatchInlineSnapshot(`
      [
        {
          "input": "{\"command\":\"pwd\",\"cwd\":\"/workspace\"}",
          "nativeName": "shell",
          "providerExecuted": true,
          "toolCallId": "call-codex",
          "toolName": "bash",
          "type": "tool-call",
        },
        {
          "result": {},
          "toolCallId": "call-codex",
          "toolName": "bash",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('matches an unnamed built-in by the longest compatible title prefix', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [
        {
          toolName: 'read',
          title: 'Read',
          toolUseKind: 'readonly',
        },
        {
          toolName: 'readLints',
          title: 'Read Lints',
          toolUseKind: 'readonly',
        },
        {
          toolName: 'edit',
          title: 'Read Lints',
          toolUseKind: 'edit',
        },
      ],
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-cursor-lints',
      title: 'Read Lints `src/index.ts`',
      kind: 'read',
      status: 'completed',
      rawInput: { paths: ['src/index.ts'] },
    });

    expect(toolEvents({ events })).toMatchInlineSnapshot(`
      [
        {
          "input": "{\"paths\":[\"src/index.ts\"]}",
          "providerExecuted": true,
          "toolCallId": "call-cursor-lints",
          "toolName": "readLints",
          "type": "tool-call",
        },
        {
          "result": {},
          "toolCallId": "call-cursor-lints",
          "toolName": "readLints",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('keeps equally specific title matches dynamic', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [
        { toolName: 'first', title: 'Operation' },
        { toolName: 'second', title: 'Operation' },
      ],
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-cursor-ambiguous',
      title: 'Operation detail',
      kind: 'other',
      status: 'completed',
      rawInput: {},
    });

    expect(toolEvents({ events })[0]).toMatchInlineSnapshot(`
      {
        "input": "{}",
        "providerExecuted": true,
        "toolCallId": "call-cursor-ambiguous",
        "toolName": "acp_tool_call-cursor-ambiguous",
        "type": "tool-call",
      }
    `);
  });

  it('uses literal schema properties to distinguish anonymous ACP tools', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [
        {
          toolName: 'webSearch',
          nativeName: 'web_search',
          inputSchema: {
            type: 'object',
            properties: {
              type: { type: 'string', const: 'webSearch' },
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      ],
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-fuzzy-search',
      title: 'Search files',
      status: 'completed',
      rawInput: { query: 'package.json' },
    });
    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-web-search',
      title: 'Search the web',
      status: 'completed',
      rawInput: {
        type: 'webSearch',
        id: 'search-1',
        query: 'AI SDK',
        action: null,
      },
    });

    expect(toolEvents({ events })).toMatchInlineSnapshot(`
      [
        {
          "input": "{\"query\":\"package.json\"}",
          "providerExecuted": true,
          "toolCallId": "call-fuzzy-search",
          "toolName": "acp_tool_call-fuzzy-search",
          "type": "tool-call",
        },
        {
          "result": {},
          "toolCallId": "call-fuzzy-search",
          "toolName": "acp_tool_call-fuzzy-search",
          "type": "tool-result",
        },
        {
          "input": "{\"type\":\"webSearch\",\"id\":\"search-1\",\"query\":\"AI SDK\",\"action\":null}",
          "nativeName": "web_search",
          "providerExecuted": true,
          "toolCallId": "call-web-search",
          "toolName": "webSearch",
          "type": "tool-call",
        },
        {
          "result": {},
          "toolCallId": "call-web-search",
          "toolName": "webSearch",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('keeps schema-ambiguous ACP calls dynamic', () => {
    const events: HarnessV1StreamPart[] = [];
    const inputSchema = {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    };
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [
        { toolName: 'TaskGet', inputSchema },
        { toolName: 'TaskStop', inputSchema },
      ],
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-ambiguous',
      title: 'Task operation',
      status: 'completed',
      rawInput: { id: 'task-1' },
    });

    expect(toolEvents({ events })[0]).toMatchInlineSnapshot(`
      {
        "input": "{\"id\":\"task-1\"}",
        "providerExecuted": true,
        "toolCallId": "call-ambiguous",
        "toolName": "acp_tool_call-ambiguous",
        "type": "tool-call",
      }
    `);
  });

  it('does not override an unknown programmatic metadata name by schema', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      builtinTools: [
        {
          toolName: 'bash',
          nativeName: 'shell',
          inputSchema: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command'],
          },
        },
      ],
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-custom',
      title: 'Custom command tool',
      status: 'completed',
      rawInput: { command: 'pwd' },
      _meta: { runtime: { toolName: 'CustomCommand' } },
    });

    expect(toolEvents({ events })[0]).toMatchInlineSnapshot(`
      {
        "input": "{\"command\":\"pwd\"}",
        "providerExecuted": true,
        "toolCallId": "call-custom",
        "toolName": "acp_tool_call-custom",
        "type": "tool-call",
      }
    `);
  });

  it('exposes unknown ACP tool calls for host-side classification', () => {
    const events: HarnessV1StreamPart[] = [];
    const candidates: ACPToolCall[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
      emitToolCallCandidate: ({ toolCall }) => candidates.push(toolCall),
      builtinTools: [{ toolName: 'bash', nativeName: 'shell' }],
    });

    translator.update({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call unknown/1',
        title: 'shell',
        kind: 'execute',
        status: 'completed',
        rawInput: { command: 'pwd' },
        _meta: { is_mcp_tool_call: true },
      },
      rawUpdate: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call unknown/1',
        title: 'shell',
        kind: 'execute',
        status: 'completed',
        rawInput: { command: 'pwd' },
        _meta: { is_mcp_tool_call: true },
      },
    });

    expect(toolEvents({ events })).toMatchInlineSnapshot(`
      [
        {
          "input": "{"command":"pwd"}",
          "providerExecuted": true,
          "toolCallId": "call unknown/1",
          "toolName": "acp_tool_call_unknown_1",
          "type": "tool-call",
        },
        {
          "result": {},
          "toolCallId": "call unknown/1",
          "toolName": "acp_tool_call_unknown_1",
          "type": "tool-result",
        },
      ]
    `);
    expect(candidates).toMatchInlineSnapshot(`
      [
        {
          "_meta": {
            "is_mcp_tool_call": true,
          },
          "kind": "execute",
          "rawInput": {
            "command": "pwd",
          },
          "status": "completed",
          "title": "shell",
          "toolCallId": "call unknown/1",
        },
      ]
    `);
  });

  it('merges partial updates through success and failure with safe JSON', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'success',
      title: 'Run',
      status: 'in_progress',
    });
    translator.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'success',
      status: 'completed',
      rawOutput: { output: 'ok', exitCode: 0 },
    });
    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'failure',
      title: 'Run',
      status: 'in_progress',
      rawInput: { command: 'false' },
    });
    translator.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'failure',
      status: 'failed',
      rawOutput: { message: 'exit 1' },
    });

    expect(toolEvents({ events })).toMatchInlineSnapshot(`
      [
        {
          "input": "{}",
          "providerExecuted": true,
          "toolCallId": "success",
          "toolName": "acp_tool_success",
          "type": "tool-call",
        },
        {
          "result": {
            "exitCode": 0,
            "output": "ok",
          },
          "toolCallId": "success",
          "toolName": "acp_tool_success",
          "type": "tool-result",
        },
        {
          "input": "{"command":"false"}",
          "providerExecuted": true,
          "toolCallId": "failure",
          "toolName": "acp_tool_failure",
          "type": "tool-call",
        },
        {
          "isError": true,
          "result": {
            "message": "exit 1",
          },
          "toolCallId": "failure",
          "toolName": "acp_tool_failure",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('finishes parallel tool calls together and serial tool calls separately', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
    });

    translator.update({
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'Plan' },
    });
    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'parallel-a',
      title: 'First',
      status: 'in_progress',
    });
    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'parallel-b',
      title: 'Second',
      status: 'in_progress',
    });
    translator.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'parallel-a',
      status: 'completed',
      rawOutput: { value: 'a' },
    });

    expect(events.filter(event => event.type === 'finish-step')).toHaveLength(
      0,
    );

    translator.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'parallel-b',
      status: 'failed',
      rawOutput: { value: 'b' },
    });

    expect(events.filter(event => event.type === 'finish-step')).toHaveLength(
      1,
    );

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'contiguous-c',
      title: 'Third',
      status: 'completed',
      rawOutput: { value: 'c' },
    });

    expect(events.filter(event => event.type === 'finish-step')).toHaveLength(
      2,
    );

    translator.update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Done' },
    });
    translator.finish({
      stopReason: 'end_turn',
      usage: null,
    });

    expect(
      withoutRaw({ events }).map(event => ({
        type: event.type,
        ...(event.type === 'finish-step'
          ? { finishReason: event.finishReason }
          : {}),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "type": "reasoning-start",
        },
        {
          "type": "reasoning-delta",
        },
        {
          "type": "reasoning-end",
        },
        {
          "type": "tool-call",
        },
        {
          "type": "tool-call",
        },
        {
          "type": "tool-result",
        },
        {
          "type": "tool-result",
        },
        {
          "finishReason": {
            "raw": "tool-calls",
            "unified": "tool-calls",
          },
          "type": "finish-step",
        },
        {
          "type": "tool-call",
        },
        {
          "type": "tool-result",
        },
        {
          "finishReason": {
            "raw": "tool-calls",
            "unified": "tool-calls",
          },
          "type": "finish-step",
        },
        {
          "type": "text-start",
        },
        {
          "type": "text-delta",
        },
        {
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "end_turn",
            "unified": "stop",
          },
          "type": "finish-step",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('finishes host tool steps after all pending results', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
    });

    translator.hostToolCall({
      toolCallId: 'host-a',
      toolName: 'first',
      input: { value: 'a' },
    });
    translator.hostToolCall({
      toolCallId: 'host-b',
      toolName: 'second',
      input: { value: 'b' },
    });
    translator.hostToolResult({
      toolCallId: 'host-a',
      toolName: 'first',
      output: { value: 'a' },
    });

    expect(events.filter(event => event.type === 'finish-step')).toHaveLength(
      0,
    );

    translator.hostToolResult({
      toolCallId: 'host-b',
      toolName: 'second',
      output: { value: 'b' },
      isError: true,
    });

    expect(
      withoutRaw({ events }).map(event => ({
        type: event.type,
        ...(event.type === 'finish-step'
          ? { finishReason: event.finishReason }
          : {}),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "type": "tool-call",
        },
        {
          "type": "tool-call",
        },
        {
          "type": "tool-result",
        },
        {
          "type": "tool-result",
        },
        {
          "finishReason": {
            "raw": "tool-calls",
            "unified": "tool-calls",
          },
          "type": "finish-step",
        },
      ]
    `);
  });

  it('does not duplicate a completed tool step when the prompt finishes', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'completed',
      title: 'Done',
      status: 'completed',
    });
    translator.finish({
      stopReason: 'end_turn',
      usage: null,
    });

    expect(
      withoutRaw({ events }).filter(
        event => event.type === 'finish-step' || event.type === 'finish',
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "finishReason": {
            "raw": "tool-calls",
            "unified": "tool-calls",
          },
          "harnessMetadata": {
            "acp": {
              "inferredStep": true,
            },
          },
          "type": "finish-step",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": undefined,
              "total": undefined,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": undefined,
            },
          },
        },
        {
          "finishReason": {
            "raw": "end_turn",
            "unified": "stop",
          },
          "harnessMetadata": {
            "acp": {
              "stopReason": "end_turn",
            },
          },
          "totalUsage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": undefined,
              "total": undefined,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": undefined,
            },
          },
          "type": "finish",
        },
      ]
    `);
  });

  it('closes a terminal step even when a tool has no terminal update', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'pending',
      title: 'Still running',
      status: 'in_progress',
    });
    translator.finish({
      stopReason: 'max_tokens',
      usage: null,
    });
    translator.finish({
      stopReason: 'end_turn',
      usage: null,
    });

    expect(
      withoutRaw({ events }).filter(
        event => event.type === 'finish-step' || event.type === 'finish',
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "finishReason": {
            "raw": "max_tokens",
            "unified": "length",
          },
          "harnessMetadata": {
            "acp": {
              "inferredStep": true,
            },
          },
          "type": "finish-step",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": undefined,
              "total": undefined,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": undefined,
            },
          },
        },
        {
          "finishReason": {
            "raw": "max_tokens",
            "unified": "length",
          },
          "harnessMetadata": {
            "acp": {
              "stopReason": "max_tokens",
            },
          },
          "totalUsage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": undefined,
              "total": undefined,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": undefined,
            },
          },
          "type": "finish",
        },
      ]
    `);
  });

  it('closes an open content block when the update stream fails', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
    });

    translator.update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Partial' },
    });
    translator.close();

    expect(withoutRaw({ events })).toMatchInlineSnapshot(`
      [
        {
          "id": "acp-text-1",
          "type": "text-start",
        },
        {
          "delta": "Partial",
          "id": "acp-text-1",
          "type": "text-delta",
        },
        {
          "id": "acp-text-1",
          "type": "text-end",
        },
      ]
    `);
  });

  it('emits reliable diff and edit locations once without inferring deletes', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
    });

    translator.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'edit',
      title: 'Editing files',
      kind: 'edit',
      status: 'completed',
      content: [
        {
          type: 'diff',
          path: '/workspace/new.txt',
          oldText: null,
          newText: 'new',
        },
        {
          type: 'diff',
          path: '/workspace/empty.txt',
          oldText: 'old',
          newText: '',
        },
      ],
      locations: [
        { path: '/workspace/new.txt' },
        { path: '/workspace/location-only.txt' },
      ],
    });

    expect(events.filter(event => event.type === 'file-change'))
      .toMatchInlineSnapshot(`
      [
        {
          "event": "create",
          "harnessMetadata": {
            "acp": {
              "toolCallId": "edit",
            },
          },
          "path": "/workspace/new.txt",
          "type": "file-change",
        },
        {
          "event": "modify",
          "harnessMetadata": {
            "acp": {
              "toolCallId": "edit",
            },
          },
          "path": "/workspace/empty.txt",
          "type": "file-change",
        },
        {
          "event": "modify",
          "harnessMetadata": {
            "acp": {
              "toolCallId": "edit",
            },
          },
          "path": "/workspace/location-only.txt",
          "type": "file-change",
        },
      ]
    `);
  });

  it('preserves complete raw updates and keeps context usage separate', () => {
    const events: HarnessV1StreamPart[] = [];
    const translator = createACPStreamTranslator({
      emit: event => events.push(event),
    });
    const rawToolUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'raw',
      title: 'Display',
      status: 'completed',
      proprietary: { nested: true },
      _meta: { extension: 'value' },
    };
    const usageUpdate = {
      sessionUpdate: 'usage_update',
      used: 120,
      size: 1000,
      cost: { amount: 0.42, currency: 'USD' },
    } as const;
    const promptResponse = {
      stopReason: 'end_turn',
      usage: {
        inputTokens: 7,
        outputTokens: 3,
        totalTokens: 10,
      },
    } as const;

    translator.update({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'raw',
        title: 'Display',
        status: 'completed',
      },
      rawUpdate: rawToolUpdate,
    });
    translator.update(usageUpdate);
    translator.raw({
      rawValue: {
        sessionUpdate: 'future_update',
        future: true,
      },
    });
    translator.finish(promptResponse);

    expect(events.filter(event => event.type === 'raw')).toEqual([
      { type: 'raw', rawValue: rawToolUpdate },
      { type: 'raw', rawValue: usageUpdate },
      {
        type: 'raw',
        rawValue: {
          sessionUpdate: 'future_update',
          future: true,
        },
      },
      { type: 'raw', rawValue: promptResponse },
    ]);
    expect(events.find(event => event.type === 'finish')?.totalUsage)
      .toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": undefined,
          "cacheWrite": undefined,
          "noCache": undefined,
          "total": 7,
        },
        "outputTokens": {
          "reasoning": undefined,
          "text": undefined,
          "total": 3,
        },
        "raw": {
          "inputTokens": 7,
          "outputTokens": 3,
          "totalTokens": 10,
        },
      }
    `);
  });

  it.each([
    ['end_turn', 'stop'],
    ['max_tokens', 'length'],
    ['max_turn_requests', 'length'],
    ['refusal', 'content-filter'],
    ['cancelled', 'other'],
  ] as const)(
    'maps %s to %s while retaining the raw reason',
    (raw, unified) => {
      expect(mapACPFinishReason({ stopReason: raw })).toEqual({ raw, unified });
    },
  );
});

function withoutRaw({
  events,
}: {
  events: ReadonlyArray<HarnessV1StreamPart>;
}): ReadonlyArray<HarnessV1StreamPart> {
  return events.filter(event => event.type !== 'raw');
}

function toolEvents({
  events,
}: {
  events: ReadonlyArray<HarnessV1StreamPart>;
}): ReadonlyArray<HarnessV1StreamPart> {
  return events.filter(
    event => event.type === 'tool-call' || event.type === 'tool-result',
  );
}
