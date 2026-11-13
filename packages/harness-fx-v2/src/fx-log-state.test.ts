import type { HarnessV2LogEvent } from '@ai-sdk/harness';
import type { SerializableValue } from '@ai-sdk/provider';
import { describe, expect, test } from 'vitest';
import { createUnknownHarnessUsage } from './fx-usage';
import { getFxModelEffectKey, readFxLogState } from './fx-log-state';

function prompt(id: string): HarnessV2LogEvent {
  return {
    type: 'submission',
    id,
    data: {
      type: 'prompt',
      message: { role: 'user', content: id },
      settings: { skills: [], tools: [] },
    },
  };
}

function effect(options: {
  id: string;
  key: string;
  input?: SerializableValue;
  deliveredSubmissionIds?: string[];
  output?: Extract<HarnessV2LogEvent, { type: 'effect-end' }>['data']['output'];
}): HarnessV2LogEvent[] {
  const start: HarnessV2LogEvent = {
    type: 'effect-start',
    id: options.id,
    data: {
      key: options.key,
      attempt: 1,
      name: options.key.split(':')[0],
      replay: 'safe',
      input: options.input ?? null,
      deliveredSubmissionIds: options.deliveredSubmissionIds ?? [],
    },
  };
  if (options.output == null) return [start];
  return [
    start,
    {
      type: 'effect-end',
      id: `${options.id}-end`,
      data: { startId: options.id, output: options.output },
    },
  ];
}

const finishTurn: HarnessV2LogEvent = {
  type: 'finish-turn',
  id: 'finish',
  data: {
    turnId: 'turn',
    finishReason: { unified: 'stop', raw: undefined },
    totalUsage: createUnknownHarnessUsage(),
  },
};

describe('getFxModelEffectKey', () => {
  test('numbers model calls by turn and position', () => {
    expect(getFxModelEffectKey({ turnIndex: 2, ordinal: 3 })).toBe('model:2:3');
  });
});

describe('readFxLogState', () => {
  test('reads turns, pending prompts and recorded effects', () => {
    const checkpoint = {
      data: new Uint8Array([1, 2, 3]).buffer,
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: createUnknownHarnessUsage(),
    };
    const state = readFxLogState({
      events: [
        prompt('p1'),
        prompt('p2'),
        ...effect({
          id: 's1',
          key: 'turn:0',
          deliveredSubmissionIds: ['p1'],
          output: { type: 'result', value: null },
        }),
        ...effect({
          id: 's2',
          key: 'catalog:0:0',
          output: { type: 'result', value: { status: 200, body: '{}' } },
        }),
        ...effect({
          id: 's3',
          key: 'model:0:0',
          input: { digest: 'abc', model: 'model-1' },
        }),
        ...effect({
          id: 's4',
          key: 'tool:call-1',
          output: { type: 'result', value: { raw: 'done' } },
        }),
        ...effect({
          id: 's5',
          key: 'checkpoint:0',
          output: { type: 'result', value: checkpoint },
        }),
        finishTurn,
      ],
    });

    expect(state.pendingPrompts.map(item => item.id)).toEqual(['p2']);
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      index: 0,
      prompt: { id: 'p1' },
      ended: true,
      checkpoint: { finishReason: { unified: 'stop', raw: 'end_turn' } },
    });
    expect(state.turns[0].checkpoint?.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(state.modelEffects.get('model:0:0')).toEqual({
      turnIndex: 0,
      ordinal: 0,
      input: { digest: 'abc', model: 'model-1' },
    });
    expect(state.catalogOutputs.get('catalog:0:0')).toEqual({
      type: 'result',
      value: { status: 200, body: '{}' },
    });
    expect(state.toolOutputs.get('call-1')).toEqual({
      type: 'result',
      value: { raw: 'done' },
    });
  });

  test('treats a turn as unfinished until a later finish-turn event', () => {
    const state = readFxLogState({
      events: [
        prompt('p1'),
        finishTurn,
        ...effect({
          id: 's1',
          key: 'turn:0',
          deliveredSubmissionIds: ['p1'],
          output: { type: 'result', value: null },
        }),
      ],
    });

    expect(state.turns).toMatchObject([{ index: 0, ended: false }]);
    expect(state.turns[0].checkpoint).toBeUndefined();
  });
});
