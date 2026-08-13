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

  it('closes open blocks and emits finish-step on assistant-message', () => {
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
        finishReason: 'tool-calls',
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
    expect(parts.map(p => p.type)).toEqual(['text-end', 'finish-step']);
    const finishStep = parts[1];
    if (finishStep.type !== 'finish-step')
      throw new Error('expected finish-step');
    expect(finishStep.finishReason.unified).toBe('tool-calls');
    expect(finishStep.usage.inputTokens.total).toBe(10);
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

  it('ignores lifecycle events handled by the session driver', () => {
    const state = newState();
    for (const type of [
      'run-started',
      'turn-started',
      'turn-finished',
    ] as const) {
      const event = { type, snapshot, iteration: 1, toolCallCount: 0 };
      expect(
        translateClineEvent(event as unknown as AgentRuntimeEvent, state),
      ).toEqual([]);
    }
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
});
