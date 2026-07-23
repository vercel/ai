import { describe, expect, it } from 'vitest';
import {
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from './create-emit-stream-event';

describe('createEmitStreamEvent', () => {
  it('emits the resolved model and a native tool step', () => {
    const state = createClaudeStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => (name === 'Bash' ? 'bash' : name),
    });

    emitStreamEvent({ type: 'system', subtype: 'init', model: 'claude-opus' });
    emitStreamEvent({
      type: 'assistant',
      message: {
        usage: { input_tokens: 3, output_tokens: 2 },
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'pwd' },
          },
        ],
      },
    });
    emitStreamEvent({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: '/tmp',
          },
        ],
      },
    });

    expect(emitted).toMatchInlineSnapshot(`
      [
        {
          "modelId": "claude-opus",
          "type": "stream-start",
        },
        {
          "input": "{\"command\":\"pwd\"}",
          "nativeName": "Bash",
          "providerExecuted": true,
          "toolCallId": "tool-1",
          "toolName": "bash",
          "type": "tool-call",
        },
        {
          "isError": false,
          "result": {
            "exitCode": 0,
            "stdout": "/tmp",
          },
          "toolCallId": "tool-1",
          "toolName": "bash",
          "type": "tool-result",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish-step",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": 0,
              "noCache": 3,
              "total": 3,
            },
            "outputTokens": {
              "text": 2,
              "total": 2,
            },
          },
        },
      ]
    `);
  });

  it('preserves retry and compaction handling', () => {
    const state = createClaudeStreamEventState();
    const warnings: unknown[] = [];
    const terminalErrors: unknown[] = [];
    const boundaries: unknown[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit: () => {},
      emitWarning: warning => warnings.push(warning),
      emitTerminalError: error => terminalErrors.push(error),
      onCompactionBoundary: boundary => boundaries.push(boundary),
      toCommonName: name => name,
    });

    emitStreamEvent({
      type: 'system',
      subtype: 'api_retry',
      attempt: 2,
      max_retries: 4,
      error_status: 500,
      retry_delay_ms: 100,
      error: 'temporary',
    });
    emitStreamEvent({
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: {
        trigger: 'auto',
        pre_tokens: 20,
        post_tokens: 5,
      },
    });
    emitStreamEvent({
      type: 'system',
      subtype: 'api_retry',
      error_status: 401,
      error: 'unauthorized',
    });

    expect({ warnings, terminalErrors, boundaries }).toMatchInlineSnapshot(`
      {
        "boundaries": [
          {
            "tokensAfter": 5,
            "tokensBefore": 20,
            "trigger": "auto",
          },
        ],
        "terminalErrors": [
          "HTTP 401: unauthorized",
        ],
        "warnings": [
          {
            "message": "Claude Code API retry: attempt 2/4; HTTP 500; retrying in 100ms; temporary",
          },
        ],
      }
    `);
  });
});
