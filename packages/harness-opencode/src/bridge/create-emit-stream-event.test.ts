import { describe, expect, it } from 'vitest';
import { createEmitStreamEvent } from './create-emit-stream-event';
import { createTranslationState } from './opencode-events';

function createEmitter({
  hostToolNames = new Set<string>(),
}: {
  hostToolNames?: Set<string>;
} = {}) {
  const state = createTranslationState();
  const emitted: Record<string, unknown>[] = [];
  const warnings: unknown[] = [];
  const errors: unknown[] = [];
  const authorized: unknown[] = [];
  const toWireToolName = (name: string) =>
    ({ view: 'read', task: 'agent' })[name] ?? name;
  const getHostToolName = (toolName: string, rawToolName: unknown) => {
    if (hostToolNames.has(toolName)) return toolName;
    return typeof rawToolName === 'string' && hostToolNames.has(rawToolName)
      ? rawToolName
      : undefined;
  };
  const emitStreamEvent = createEmitStreamEvent({
    state,
    emit: event => emitted.push(event),
    emitWarning: warning => warnings.push(warning),
    emitError: error => errors.push(error),
    toWireToolName,
    nativeNameField: ({ nativeName, toolName }) =>
      nativeName === toolName ? {} : { nativeName },
    getHostToolName,
    authorizeHostToolCall: input => authorized.push(input),
    stripWorkDir: file => file.replace('/work/', ''),
    formatError: error => String(error),
  });
  return { state, emitted, warnings, errors, authorized, emitStreamEvent };
}

describe('createEmitStreamEvent', () => {
  it('emits text, final deltas, and step usage', () => {
    const { emitted, emitStreamEvent } = createEmitter();

    emitStreamEvent({
      type: 'session.next.text.started',
      properties: { textID: 'text-1' },
    });
    emitStreamEvent({
      type: 'session.next.text.delta',
      properties: { textID: 'text-1', delta: 'hello ' },
    });
    emitStreamEvent({
      type: 'session.next.text.ended',
      properties: { textID: 'text-1', text: 'hello world' },
    });
    emitStreamEvent({
      type: 'session.next.step.ended',
      properties: {
        finish: 'stop',
        tokens: {
          input: 3,
          output: 2,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        cost: 0.01,
      },
    });

    expect(emitted).toMatchInlineSnapshot(`
      [
        {
          "id": "text-1",
          "type": "text-start",
        },
        {
          "delta": "hello ",
          "id": "text-1",
          "type": "text-delta",
        },
        {
          "delta": "world",
          "id": "text-1",
          "type": "text-delta",
        },
        {
          "id": "text-1",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "harnessMetadata": {
            "opencode": {
              "cost": 0.01,
            },
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
              "reasoning": 0,
              "text": 2,
              "total": 2,
            },
          },
        },
      ]
    `);
  });

  it('translates provider and host tool events without duplication', () => {
    const { emitted, authorized, emitStreamEvent } = createEmitter({
      hostToolNames: new Set(['weather']),
    });

    emitStreamEvent({
      type: 'session.next.tool.called',
      properties: {
        callID: 'tool-1',
        tool: 'view',
        input: { file: 'README.md' },
      },
    });
    emitStreamEvent({
      type: 'session.next.tool.success',
      properties: { callID: 'tool-1', result: 'contents' },
    });
    emitStreamEvent({
      type: 'session.next.tool.called',
      properties: {
        callID: 'tool-2',
        tool: 'weather',
        input: { city: 'Berlin' },
      },
    });
    emitStreamEvent({
      type: 'session.next.tool.success',
      properties: { callID: 'tool-2', result: 'sunny' },
    });

    expect({ emitted, authorized }).toMatchInlineSnapshot(`
      {
        "authorized": [
          {
            "callID": "tool-2",
            "input": {
              "city": "Berlin",
            },
            "toolName": "weather",
          },
        ],
        "emitted": [
          {
            "input": "{\"file\":\"README.md\"}",
            "nativeName": "view",
            "providerExecuted": true,
            "toolCallId": "tool-1",
            "toolName": "read",
            "type": "tool-call",
          },
          {
            "result": "contents",
            "toolCallId": "tool-1",
            "toolName": "read",
            "type": "tool-result",
          },
        ],
      }
    `);
  });

  it('preserves retry, error, compaction, and file events', () => {
    const { emitted, warnings, errors, emitStreamEvent } = createEmitter();

    emitStreamEvent({
      type: 'session.next.retried',
      properties: {
        attempt: 2,
        error: { statusCode: 500, message: 'temporary' },
      },
    });
    emitStreamEvent({
      type: 'session.next.compaction.ended',
      properties: { reason: 'auto', text: 'summary', recent: 'recent' },
    });
    emitStreamEvent({
      type: 'file.edited',
      properties: { file: '/work/src/index.ts' },
    });
    emitStreamEvent({
      type: 'session.next.step.failed',
      properties: { error: 'failed' },
    });

    expect({ emitted, warnings, errors }).toMatchInlineSnapshot(`
      {
        "emitted": [
          {
            "harnessMetadata": {
              "opencode": {
                "recent": "recent",
              },
            },
            "summary": "summary",
            "trigger": "auto",
            "type": "compaction",
          },
          {
            "event": "modify",
            "path": "src/index.ts",
            "type": "file-change",
          },
        ],
        "errors": [
          {
            "error": "failed",
            "message": "OpenCode step failed",
          },
        ],
        "warnings": [
          {
            "message": "OpenCode session retry: attempt 2; HTTP 500; temporary",
          },
        ],
      }
    `);
  });
});
