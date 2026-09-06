import { describe, expect, it, vi } from 'vitest';
import {
  createDeepAgentsStreamEventState,
  createEmitStreamEvent,
} from './create-emit-stream-event';

vi.mock('node:crypto', () => ({ randomUUID: () => 'uuid' }));

describe('createEmitStreamEvent', () => {
  it('emits model, content, and step events while counting nested usage', () => {
    const state = createDeepAgentsStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      configuredModel: 'configured-model',
      hostToolNames: new Set(),
      mcpToolNames: new Set(),
      emit: event => emitted.push(event),
    });

    emitStreamEvent({
      event: 'on_chat_model_start',
      metadata: { ls_model_name: 'resolved-model' },
    });
    emitStreamEvent({
      event: 'on_chat_model_stream',
      data: {
        chunk: {
          content: 'hello',
          usage_metadata: { input_tokens: 3, output_tokens: 1 },
        },
      },
    });
    emitStreamEvent({
      event: 'on_chat_model_end',
      data: {
        output: { usage_metadata: { input_tokens: 3, output_tokens: 2 } },
      },
    });
    emitStreamEvent({
      event: 'on_chat_model_end',
      metadata: { langgraph_checkpoint_ns: 'root|subagent' },
      data: {
        output: { usage_metadata: { input_tokens: 5, output_tokens: 4 } },
      },
    });
    emitStreamEvent({ event: 'on_chat_model_start' });

    expect({ emitted, input: state.inputTokens, output: state.outputTokens })
      .toMatchInlineSnapshot(`
        {
          "emitted": [
            {
              "modelId": "resolved-model",
              "type": "stream-start",
            },
            {
              "id": "text-uuid",
              "type": "text-start",
            },
            {
              "delta": "hello",
              "id": "text-uuid",
              "type": "text-delta",
            },
            {
              "id": "text-uuid",
              "type": "text-end",
            },
            {
              "finishReason": {
                "unified": "stop",
              },
              "type": "finish-step",
              "usage": {
                "inputTokens": {
                  "total": 3,
                },
                "outputTokens": {
                  "total": 2,
                },
              },
            },
          ],
          "input": 8,
          "output": 6,
        }
      `);
  });

  it('preserves tool input unwrapping and approved call ids', () => {
    const state = createDeepAgentsStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      configuredModel: undefined,
      hostToolNames: new Set(),
      mcpToolNames: new Set(),
      emit: event => emitted.push(event),
    });

    emitStreamEvent({
      event: 'on_tool_start',
      name: 'execute',
      run_id: 'run-1',
      data: { input: { input: '{"command":"pwd"}' } },
    });
    state.approvedToolQueue.set('read_file', ['approval-1']);
    emitStreamEvent({
      event: 'on_tool_start',
      name: 'read_file',
      run_id: 'run-2',
      data: { input: { path: 'README.md' } },
    });
    emitStreamEvent({
      event: 'on_tool_end',
      name: 'read_file',
      run_id: 'run-2',
      data: { output: { content: 'contents' } },
    });

    expect(emitted).toMatchInlineSnapshot(`
      [
        {
          "input": "{\"command\":\"pwd\"}",
          "nativeName": "execute",
          "providerExecuted": true,
          "toolCallId": "run-1",
          "toolName": "bash",
          "type": "tool-call",
        },
        {
          "result": "contents",
          "toolCallId": "approval-1",
          "toolName": "read",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('emits reasoning from Anthropic and normalized LangChain blocks', () => {
    const state = createDeepAgentsStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      configuredModel: undefined,
      hostToolNames: new Set(),
      mcpToolNames: new Set(),
      emit: event => emitted.push(event),
    });

    emitStreamEvent({ event: 'on_chat_model_start' });
    emitStreamEvent({
      event: 'on_chat_model_stream',
      data: {
        chunk: {
          content: [{ type: 'thinking', thinking: 'First' }],
        },
      },
    });
    emitStreamEvent({
      event: 'on_chat_model_stream',
      data: {
        chunk: {
          content: [{ type: 'reasoning-delta', reasoning: ' second' }],
        },
      },
    });
    emitStreamEvent({ event: 'on_chat_model_end' });

    expect(emitted).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
        },
        {
          "id": "reasoning-uuid",
          "type": "reasoning-start",
        },
        {
          "delta": "First",
          "id": "reasoning-uuid",
          "type": "reasoning-delta",
        },
        {
          "delta": " second",
          "id": "reasoning-uuid",
          "type": "reasoning-delta",
        },
        {
          "id": "reasoning-uuid",
          "type": "reasoning-end",
        },
      ]
    `);
  });

  it('marks only external MCP tools as dynamic', () => {
    const state = createDeepAgentsStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      configuredModel: undefined,
      hostToolNames: new Set(['mcp__custom__typed']),
      mcpToolNames: new Set(['mcp__memory__search']),
      emit: event => emitted.push(event),
    });

    emitStreamEvent({
      event: 'on_tool_start',
      name: 'mcp__memory__search',
      run_id: 'mcp-run',
      data: { input: { query: 'AI SDK' } },
    });
    emitStreamEvent({
      event: 'on_tool_end',
      name: 'mcp__memory__search',
      run_id: 'mcp-run',
      data: { output: 'found' },
    });
    emitStreamEvent({
      event: 'on_tool_start',
      name: 'mcp__custom__typed',
      run_id: 'host-run',
      data: { input: {} },
    });

    expect(emitted).toMatchInlineSnapshot(`
      [
        {
          "dynamic": true,
          "input": "{\"query\":\"AI SDK\"}",
          "nativeName": "mcp__memory__search",
          "providerExecuted": true,
          "toolCallId": "mcp-run",
          "toolName": "mcp__memory__search",
          "type": "tool-call",
        },
        {
          "dynamic": true,
          "result": "found",
          "toolCallId": "mcp-run",
          "toolName": "mcp__memory__search",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('does not expose the internal structured output tool', () => {
    const state = createDeepAgentsStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      configuredModel: undefined,
      hostToolNames: new Set(),
      mcpToolNames: new Set(),
      structuredOutputToolNames: new Set(['StructuredOutput']),
      emit: event => emitted.push(event),
    });

    emitStreamEvent({
      event: 'on_tool_start',
      name: 'StructuredOutput',
      run_id: 'structured-output',
      data: { input: { answer: 'yes' } },
    });
    emitStreamEvent({
      event: 'on_tool_end',
      name: 'StructuredOutput',
      run_id: 'structured-output',
      data: { output: { answer: 'yes' } },
    });

    expect(emitted).toEqual([]);
  });
});
