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
});
