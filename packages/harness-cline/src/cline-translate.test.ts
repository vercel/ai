import type {
  AgentRuntimeEvent,
  AgentRuntimeStateSnapshot,
} from '@cline/agents';
import { describe, expect, it } from 'vitest';
import {
  createClineTranslatorState,
  finishClineTranslation,
  toolApprovalParts,
  translateClineEvent,
} from './cline-translate';

const snapshot = {} as AgentRuntimeStateSnapshot;

function newState() {
  return createClineTranslatorState({
    builtinToolNames: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'ls'],
  });
}

describe('translateClineEvent', () => {
  it('translates ask_question into a client-side canonical question call', () => {
    const state = createClineTranslatorState({
      builtinToolNames: ['ask_question'],
    });
    const [part] = translateClineEvent(
      {
        type: 'tool-started',
        snapshot,
        iteration: 1,
        toolCall: {
          type: 'tool-call',
          toolCallId: 'question-call',
          toolName: 'ask_question',
          input: {
            question: 'Which framework?',
            options: ['React', 'Vue'],
          },
        },
      },
      state,
    );

    expect(part).toEqual({
      type: 'tool-call',
      toolCallId: 'question-call',
      toolName: 'askUserQuestions',
      input: JSON.stringify({
        allowPartialAnswers: false,
        questions: [
          {
            id: 'question-1',
            question: 'Which framework?',
            options: [
              { id: 'option-1', label: 'React' },
              { id: 'option-2', label: 'Vue' },
            ],
            allowFreeForm: true,
          },
        ],
      }),
      providerExecuted: false,
      providerMetadata: {
        cline: {
          nativeRequest: {
            question: 'Which framework?',
            options: ['React', 'Vue'],
          },
        },
      },
      nativeName: 'ask_question',
    });
  });

  it('opens a text block on the first delta and streams subsequent deltas', () => {
    const state = newState();
    const first = translateClineEvent(
      {
        type: 'assistant-text-delta',
        snapshot,
        iteration: 1,
        text: 'Hel',
        accumulatedText: 'Hel',
      },
      state,
    );
    expect(first.map(p => p.type)).toEqual(['text-start', 'text-delta']);

    const second = translateClineEvent(
      {
        type: 'assistant-text-delta',
        snapshot,
        iteration: 1,
        text: 'lo',
        accumulatedText: 'Hello',
      },
      state,
    );
    expect(second.map(p => p.type)).toEqual(['text-delta']);
  });

  it('closes an open reasoning block when text starts', () => {
    const state = newState();
    translateClineEvent(
      {
        type: 'assistant-reasoning-delta',
        snapshot,
        iteration: 1,
        text: 'thinking…',
        accumulatedText: 'thinking…',
      },
      state,
    );
    const parts = translateClineEvent(
      {
        type: 'assistant-text-delta',
        snapshot,
        iteration: 1,
        text: 'answer',
        accumulatedText: 'answer',
      },
      state,
    );
    expect(parts.map(p => p.type)).toEqual([
      'reasoning-end',
      'text-start',
      'text-delta',
    ]);
  });

  it('closes an open text block when reasoning starts', () => {
    const state = newState();
    translateClineEvent(
      {
        type: 'assistant-text-delta',
        snapshot,
        iteration: 1,
        text: 'answer',
        accumulatedText: 'answer',
      },
      state,
    );
    const parts = translateClineEvent(
      {
        type: 'assistant-reasoning-delta',
        snapshot,
        iteration: 1,
        text: 'thinking…',
        accumulatedText: 'thinking…',
      },
      state,
    );

    expect(parts).toEqual([
      { type: 'text-end', id: 'text-1' },
      { type: 'reasoning-start', id: 'reasoning-2' },
      { type: 'reasoning-delta', id: 'reasoning-2', delta: 'thinking…' },
    ]);
    expect(finishClineTranslation(state)).toEqual([
      { type: 'reasoning-end', id: 'reasoning-2' },
    ]);
  });

  it('closes open blocks at assistant-message and finishes a no-tool step at turn-finished', () => {
    const state = newState();
    translateClineEvent(
      {
        type: 'assistant-text-delta',
        snapshot,
        iteration: 1,
        text: 'hi',
        accumulatedText: 'hi',
      },
      state,
    );
    const parts = translateClineEvent(
      {
        type: 'assistant-message',
        snapshot,
        iteration: 1,
        finishReason: 'stop',
        message: {
          id: 'm1',
          role: 'assistant',
          content: [{ type: 'text', text: 'hi' }],
          createdAt: 0,
          metrics: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        },
      },
      state,
    );
    expect(parts).toEqual([{ type: 'text-end', id: 'text-1' }]);

    const finished = translateClineEvent(
      {
        type: 'turn-finished',
        snapshot,
        iteration: 1,
        toolCallCount: 0,
      },
      state,
    );
    expect(finished).toHaveLength(1);
    const finishStep = finished[0];
    if (finishStep.type !== 'finish-step') {
      throw new Error('expected finish-step');
    }
    expect(finishStep.finishReason.unified).toBe('stop');
    expect(finishStep.usage.inputTokens.total).toBe(10);
  });

  it('emits finish-step after parallel tool results finish out of order', () => {
    const state = newState();
    const parts: ReturnType<typeof translateClineEvent> = [];
    const firstToolCall = {
      type: 'tool-call' as const,
      toolCallId: 'call-1',
      toolName: 'read',
      input: { file_path: 'a.txt' },
    };
    const secondToolCall = {
      type: 'tool-call' as const,
      toolCallId: 'call-2',
      toolName: 'read',
      input: { file_path: 'b.txt' },
    };

    parts.push(
      ...translateClineEvent(
        {
          type: 'assistant-message',
          snapshot,
          iteration: 1,
          finishReason: 'tool-calls',
          message: {
            id: 'm1',
            role: 'assistant',
            content: [firstToolCall, secondToolCall],
            createdAt: 0,
            metrics: {
              inputTokens: 12,
              outputTokens: 6,
              cacheReadTokens: 2,
              cacheWriteTokens: 0,
            },
          },
        },
        state,
      ),
    );

    for (const toolCall of [firstToolCall, secondToolCall]) {
      parts.push(
        ...translateClineEvent(
          {
            type: 'tool-started',
            snapshot,
            iteration: 1,
            toolCall,
          },
          state,
        ),
      );
    }

    for (const toolCall of [secondToolCall, firstToolCall]) {
      parts.push(
        ...translateClineEvent(
          {
            type: 'tool-finished',
            snapshot,
            iteration: 1,
            toolCall,
            message: {
              id: `result-${toolCall.toolCallId}`,
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  output: `${toolCall.toolCallId} result`,
                },
              ],
              createdAt: 0,
            },
          },
          state,
        ),
      );
    }

    expect(parts.map(part => part.type)).toEqual([
      'tool-call',
      'tool-call',
      'tool-result',
      'tool-result',
    ]);
    expect(
      parts
        .filter(part => part.type === 'tool-result')
        .map(part => part.toolCallId),
    ).toEqual(['call-2', 'call-1']);

    parts.push(
      ...translateClineEvent(
        {
          type: 'turn-finished',
          snapshot,
          iteration: 1,
          toolCallCount: 2,
        },
        state,
      ),
    );

    expect(parts.map(part => part.type)).toEqual([
      'tool-call',
      'tool-call',
      'tool-result',
      'tool-result',
      'finish-step',
    ]);
    const finishStep = parts.at(-1);
    if (finishStep?.type !== 'finish-step') {
      throw new Error('expected finish-step');
    }
    expect(finishStep.finishReason.unified).toBe('tool-calls');
    expect(finishStep.usage.inputTokens).toEqual({
      total: 12,
      noCache: undefined,
      cacheRead: 2,
      cacheWrite: 0,
    });
  });

  it('emits exactly one finish-step for each iteration', () => {
    const state = newState();
    const finishReasons: string[] = [];

    for (const { iteration, finishReason, inputTokens } of [
      { iteration: 1, finishReason: 'tool-calls' as const, inputTokens: 10 },
      { iteration: 2, finishReason: 'stop' as const, inputTokens: 20 },
    ]) {
      expect(
        translateClineEvent(
          {
            type: 'assistant-message',
            snapshot,
            iteration,
            finishReason,
            message: {
              id: `message-${iteration}`,
              role: 'assistant',
              content: [],
              createdAt: 0,
              metrics: {
                inputTokens,
                outputTokens: 5,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
            },
          },
          state,
        ),
      ).toEqual([]);

      const finished = translateClineEvent(
        {
          type: 'turn-finished',
          snapshot,
          iteration,
          toolCallCount: finishReason === 'tool-calls' ? 1 : 0,
        },
        state,
      );
      expect(finished).toHaveLength(1);
      const finishStep = finished[0];
      if (finishStep.type !== 'finish-step') {
        throw new Error('expected finish-step');
      }
      finishReasons.push(finishStep.finishReason.unified);
      expect(finishStep.usage.inputTokens.total).toBe(inputTokens);
      expect(
        translateClineEvent(
          {
            type: 'turn-finished',
            snapshot,
            iteration,
            toolCallCount: 0,
          },
          state,
        ),
      ).toEqual([]);
    }

    expect(finishReasons).toEqual(['tool-calls', 'stop']);
  });

  it('marks built-in tool calls providerExecuted and serializes input', () => {
    const state = newState();
    const parts = translateClineEvent(
      {
        type: 'tool-started',
        snapshot,
        iteration: 1,
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'bash',
          input: { command: 'ls' },
        },
      },
      state,
    );
    expect(parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'bash',
        input: JSON.stringify({ command: 'ls' }),
        providerExecuted: true,
      },
    ]);
  });

  it('marks the in-host skills tool providerExecuted', () => {
    const state = createClineTranslatorState({
      builtinToolNames: ['skills'],
    });
    const parts = translateClineEvent(
      {
        type: 'tool-started',
        snapshot,
        iteration: 1,
        toolCall: {
          type: 'tool-call',
          toolCallId: 'skill-call',
          toolName: 'skills',
          input: { skill: 'release-notes' },
        },
      },
      state,
    );

    expect(parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'skill-call',
        toolName: 'skills',
        input: JSON.stringify({ skill: 'release-notes' }),
        providerExecuted: true,
      },
    ]);
  });

  it('does not mark user tool calls providerExecuted', () => {
    const state = newState();
    const parts = translateClineEvent(
      {
        type: 'tool-started',
        snapshot,
        iteration: 1,
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'my_custom_tool',
          input: {},
        },
      },
      state,
    );
    if (parts[0]?.type !== 'tool-call') throw new Error('expected tool-call');
    expect(parts[0].providerExecuted).toBeUndefined();
  });

  it('marks external MCP tool calls and results as provider-executed dynamic tools', () => {
    const state = createClineTranslatorState({
      builtinToolNames: [],
      mcpToolNames: ['context7__resolve-library-id'],
    });
    const toolCall = {
      type: 'tool-call' as const,
      toolCallId: 'mcp-call',
      toolName: 'context7__resolve-library-id',
      input: { libraryName: 'next.js' },
    };

    const call = translateClineEvent(
      {
        type: 'tool-started',
        snapshot,
        iteration: 1,
        toolCall,
      },
      state,
    );
    const result = translateClineEvent(
      {
        type: 'tool-finished',
        snapshot,
        iteration: 1,
        toolCall,
        message: {
          id: 'mcp-result',
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'mcp-call',
              toolName: 'context7__resolve-library-id',
              output: { content: [{ type: 'text', text: '/vercel/next.js' }] },
            },
          ],
          createdAt: 0,
        },
      },
      state,
    );

    expect([call[0], result[0]]).toMatchInlineSnapshot(`
      [
        {
          "dynamic": true,
          "input": "{\"libraryName\":\"next.js\"}",
          "providerExecuted": true,
          "toolCallId": "mcp-call",
          "toolName": "context7__resolve-library-id",
          "type": "tool-call",
        },
        {
          "dynamic": true,
          "result": {
            "content": [
              {
                "text": "/vercel/next.js",
                "type": "text",
              },
            ],
          },
          "toolCallId": "mcp-call",
          "toolName": "context7__resolve-library-id",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('keeps a typed host tool static when its name matches an MCP tool', () => {
    const state = createClineTranslatorState({
      builtinToolNames: [],
      hostToolNames: ['context7__resolve-library-id'],
      mcpToolNames: ['context7__resolve-library-id'],
    });
    const parts = translateClineEvent(
      {
        type: 'tool-started',
        snapshot,
        iteration: 1,
        toolCall: {
          type: 'tool-call',
          toolCallId: 'host-call',
          toolName: 'context7__resolve-library-id',
          input: {},
        },
      },
      state,
    );

    expect(parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'host-call',
        toolName: 'context7__resolve-library-id',
        input: '{}',
      },
    ]);
  });

  it('emits tool-result from the tool message', () => {
    const state = newState();
    const parts = translateClineEvent(
      {
        type: 'tool-finished',
        snapshot,
        iteration: 1,
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'read',
          input: { file_path: 'a.txt' },
        },
        message: {
          id: 'm2',
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'read',
              output: 'file contents',
            },
          ],
          createdAt: 0,
        },
      },
      state,
    );
    expect(parts).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'read',
        result: 'file contents',
      },
    ]);
  });

  it('preserves the error flag from the Cline tool result', () => {
    const state = newState();
    const parts = translateClineEvent(
      {
        type: 'tool-finished',
        snapshot,
        iteration: 1,
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'read',
          input: { file_path: 'missing.txt' },
        },
        message: {
          id: 'm2',
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'read',
              output: { error: 'File not found: missing.txt' },
              isError: true,
            },
          ],
          createdAt: 0,
        },
      },
      state,
    );

    expect(parts).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'read',
        result: { error: 'File not found: missing.txt' },
        isError: true,
      },
    ]);
  });

  it('ignores lifecycle events handled by the session driver', () => {
    const state = newState();
    for (const type of [
      'run-started',
      'turn-started',
      'run-finished',
    ] as const) {
      const event = { type, snapshot, iteration: 1, toolCallCount: 0 };
      expect(
        translateClineEvent(event as unknown as AgentRuntimeEvent, state),
      ).toEqual([]);
    }
  });

  it('ignores turn-finished without a buffered assistant message', () => {
    const state = newState();
    expect(
      translateClineEvent(
        {
          type: 'turn-finished',
          snapshot,
          iteration: 1,
          toolCallCount: 0,
        },
        state,
      ),
    ).toEqual([]);
  });
});

describe('toolApprovalParts', () => {
  it('emits tool-call before the approval request and dedupes tool-started', () => {
    const state = newState();
    const parts = toolApprovalParts(state, {
      toolCallId: 'call-9',
      toolName: 'bash',
      input: { command: 'rm -rf build' },
    });
    expect(parts.map(p => p.type)).toEqual([
      'tool-call',
      'tool-approval-request',
    ]);

    // The runtime's own tool-started for the same call must not re-emit.
    const later = translateClineEvent(
      {
        type: 'tool-started',
        snapshot,
        iteration: 1,
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-9',
          toolName: 'bash',
          input: { command: 'rm -rf build' },
        },
      },
      state,
    );
    expect(later).toEqual([]);
  });
});

describe('finishClineTranslation', () => {
  it('closes dangling blocks', () => {
    const state = newState();
    translateClineEvent(
      {
        type: 'assistant-reasoning-delta',
        snapshot,
        iteration: 1,
        text: 'thinking…',
        accumulatedText: 'thinking…',
      },
      state,
    );
    expect(finishClineTranslation(state).map(p => p.type)).toEqual([
      'reasoning-end',
    ]);
    expect(finishClineTranslation(state)).toEqual([]);
  });

  it('discards a buffered step that never reached turn-finished', () => {
    const state = newState();
    translateClineEvent(
      {
        type: 'assistant-message',
        snapshot,
        iteration: 1,
        finishReason: 'error',
        message: {
          id: 'm1',
          role: 'assistant',
          content: [],
          createdAt: 0,
        },
      },
      state,
    );

    expect(finishClineTranslation(state)).toEqual([]);
    expect(
      translateClineEvent(
        {
          type: 'turn-finished',
          snapshot,
          iteration: 1,
          toolCallCount: 0,
        },
        state,
      ),
    ).toEqual([]);
  });
});
