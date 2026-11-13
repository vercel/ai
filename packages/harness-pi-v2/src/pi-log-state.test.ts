import type { HarnessV2LogEvent } from '@ai-sdk/harness';
import { describe, expect, test } from 'vitest';
import { readPiLogState, restorePiTranscript } from './pi-log-state';

const settings = { skills: [], tools: [] };
const system = { role: 'system', content: '', timestamp: 1 };
const user = (text: string) => ({ role: 'user', content: text, timestamp: 2 });
const assistant = ({
  content,
  stopReason = 'stop',
}: {
  content: Array<Record<string, unknown>>;
  stopReason?: string;
}) => ({ role: 'assistant', content, stopReason, timestamp: 3 });

function prompt({ id, text }: { id: string; text: string }): HarnessV2LogEvent {
  return {
    type: 'submission',
    id,
    data: {
      type: 'prompt',
      message: { role: 'user', content: text },
      settings,
    },
  };
}

function start(options: {
  id: string;
  key: string;
  appended?: unknown[];
  delivered?: string[];
}): HarnessV2LogEvent {
  return {
    type: 'effect-start',
    id: options.id,
    data: {
      key: options.key,
      attempt: 1,
      name: options.key.startsWith('model:') ? 'model' : 'tool.read',
      replay: 'safe',
      input: options.key.startsWith('model:')
        ? ({
            appended: options.appended ?? [],
            contextLength: 0,
            model: 'faux/faux-1',
          } as never)
        : {},
      deliveredSubmissionIds: options.delivered ?? [],
    },
  };
}

function end({
  startId,
  value,
}: {
  startId: string;
  value: unknown;
}): HarnessV2LogEvent {
  return {
    type: 'effect-end',
    id: `end-${startId}`,
    data: { startId, output: { type: 'result', value: value as never } },
  };
}

const finishTurn: HarnessV2LogEvent = {
  type: 'finish-turn',
  id: 'finish',
  data: {
    turnId: 'opaque',
    finishReason: { unified: 'stop', raw: 'stop' },
    totalUsage: {
      inputTokens: {
        total: 0,
        noCache: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
  },
};

describe('readPiLogState', () => {
  test('reads prompts, pending prompts, model effects and tool outputs', () => {
    const state = readPiLogState({
      events: [
        prompt({ id: 'p1', text: 'first' }),
        start({
          id: 's0',
          key: 'model:0',
          appended: [user('first')],
          delivered: ['p1'],
        }),
        end({
          startId: 's0',
          value: assistant({
            content: [
              { type: 'toolCall', id: 'c1', name: 'read', arguments: {} },
            ],
            stopReason: 'toolUse',
          }),
        }),
        start({ id: 's1', key: 'tool:c1' }),
        end({ startId: 's1', value: { raw: 'file' } }),
        prompt({ id: 'p2', text: 'second' }),
      ],
    });

    expect(state.prompts.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(state.pendingPrompts.map(p => p.id)).toEqual(['p2']);
    expect(state.modelEffects).toMatchObject([
      {
        ordinal: 0,
        deliveredSubmissionIds: ['p1'],
        output: { type: 'result' },
      },
    ]);
    expect(state.toolOutputs.get('c1')).toEqual({
      type: 'result',
      value: { raw: 'file' },
    });
    expect(state.currentTurn).toMatchObject({
      prompt: { id: 'p1' },
      firstModelOrdinal: 0,
      ended: false,
    });
  });

  test('treats a turn as ended once a finish-turn event follows its start', () => {
    const state = readPiLogState({
      events: [
        prompt({ id: 'p1', text: 'first' }),
        start({ id: 's0', key: 'model:0', delivered: ['p1'] }),
        end({ startId: 's0', value: assistant({ content: [] }) }),
        finishTurn,
      ],
    });

    expect(state.currentTurn?.ended).toBe(true);
  });

  test('keeps the latest attempt of a model effect', () => {
    const state = readPiLogState({
      events: [
        prompt({ id: 'p1', text: 'first' }),
        start({ id: 's0', key: 'model:0', delivered: ['p1'] }),
        {
          type: 'effect-end',
          id: 'e0',
          data: {
            startId: 's0',
            output: { type: 'interrupted', retryable: true },
          },
        },
        start({ id: 's1', key: 'model:0', delivered: ['p1'] }),
        end({ startId: 's1', value: assistant({ content: [] }) }),
      ],
    });

    expect(state.modelEffects).toHaveLength(1);
    expect(state.modelEffects[0].output).toMatchObject({ type: 'result' });
  });
});

describe('restorePiTranscript', () => {
  const isBuiltinTool = () => true;

  test('starts empty without model effects', () => {
    expect(
      restorePiTranscript({
        state: readPiLogState({ events: [prompt({ id: 'p1', text: 'hi' })] }),
        isBuiltinTool,
      }),
    ).toEqual({
      messages: [],
      recorded: 0,
      nextModelOrdinal: 0,
      resume: false,
    });
  });

  test('re-enters the last model call of an unfinished turn', () => {
    const toolUse = assistant({
      content: [{ type: 'toolCall', id: 'c1', name: 'read', arguments: {} }],
      stopReason: 'toolUse',
    });
    const result = { role: 'toolResult', toolCallId: 'c1', timestamp: 4 };
    const restored = restorePiTranscript({
      state: readPiLogState({
        events: [
          prompt({ id: 'p1', text: 'first' }),
          start({
            id: 's0',
            key: 'model:0',
            appended: [system, user('first')],
            delivered: ['p1'],
          }),
          end({ startId: 's0', value: toolUse }),
          start({ id: 's1', key: 'model:1', appended: [result] }),
        ],
      }),
      isBuiltinTool,
    });

    expect(restored).toEqual({
      messages: [system, user('first'), toolUse, result],
      recorded: 3,
      nextModelOrdinal: 1,
      resume: true,
    });
  });

  test('includes the last response of an ended turn and answers its tool calls', () => {
    const toolUse = assistant({
      content: [
        { type: 'toolCall', id: 'c1', name: 'read', arguments: {} },
        { type: 'toolCall', id: 'c2', name: 'read', arguments: {} },
      ],
      stopReason: 'toolUse',
    });
    const restored = restorePiTranscript({
      state: readPiLogState({
        events: [
          prompt({ id: 'p1', text: 'first' }),
          start({
            id: 's0',
            key: 'model:0',
            appended: [system, user('first')],
            delivered: ['p1'],
          }),
          end({ startId: 's0', value: toolUse }),
          start({ id: 's1', key: 'tool:c1' }),
          end({
            startId: 's1',
            value: { raw: { content: [{ type: 'text', text: 'contents' }] } },
          }),
          finishTurn,
        ],
      }),
      isBuiltinTool,
    });

    expect(restored.recorded).toBe(3);
    expect(restored.nextModelOrdinal).toBe(1);
    expect(restored.resume).toBe(false);
    expect(restored.messages.slice(3)).toMatchObject([
      {
        role: 'toolResult',
        toolCallId: 'c1',
        content: [{ type: 'text', text: 'contents' }],
        isError: false,
      },
      {
        role: 'toolResult',
        toolCallId: 'c2',
        content: [
          {
            type: 'text',
            text: 'Not run: the turn ended before this call ran.',
          },
        ],
        isError: true,
      },
    ]);
  });
});
