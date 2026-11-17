import type {
  HarnessV2Log,
  HarnessV2LogEffectAttempt,
  HarnessV2LogEffectEndEvent,
  HarnessV2LogFinishTurnEvent,
  HarnessV2LogSubmissionEvent,
  HarnessV2LogTurn,
} from '@ai-sdk/harness';
import type { SerializableValue } from '@ai-sdk/provider';
import { describe, expect, test } from 'vitest';
import { getFxModelEffectKey, readFxLogState } from './fx-log-state';
import { createUnknownHarnessUsage } from './fx-usage';

/**
 * Returns a log whose lookups return the given values as they are.
 */
function createStubLog(options: {
  submissions?: HarnessV2LogSubmissionEvent[];
  undelivered?: HarnessV2LogSubmissionEvent[];
  effects?: HarnessV2LogEffectAttempt[];
  turns?: HarnessV2LogTurn[];
}): HarnessV2Log {
  const { submissions = [], effects = [], turns = [] } = options;
  return {
    append: async () => {
      throw new Error('appending is not supported');
    },
    onAppend: () => () => {},
    getSubmissions: () => submissions,
    getUndeliveredSubmissions: () => options.undelivered ?? [],
    getEffect: ({ key }) =>
      effects.find(attempt => attempt.start.data.key === key),
    getEffects: ({ keyPrefix } = {}) =>
      effects.filter(
        attempt =>
          keyPrefix == null || attempt.start.data.key.startsWith(keyPrefix),
      ),
    getCurrentTurn: () => turns.at(-1),
    getTurns: () => turns,
    getAdapterEvents: () => [],
  };
}

function prompt(id: string): HarnessV2LogSubmissionEvent {
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

function attempt(options: {
  key: string;
  input?: SerializableValue;
  output?: HarnessV2LogEffectEndEvent['data']['output'];
}): HarnessV2LogEffectAttempt {
  const start = {
    type: 'effect-start',
    id: `start-${options.key}`,
    data: {
      key: options.key,
      attempt: 1,
      name: options.key.split(':')[0],
      replay: 'safe',
      input: options.input ?? null,
      deliveredSubmissionIds: [],
    },
  } as const;
  if (options.output == null) return { start };
  return {
    start,
    end: {
      type: 'effect-end',
      id: `end-${options.key}`,
      data: { startId: start.id, output: options.output },
    },
  };
}

const finishTurn: HarnessV2LogFinishTurnEvent = {
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
    const steer: HarnessV2LogSubmissionEvent = {
      type: 'submission',
      id: 's1',
      data: { type: 'steer', message: { role: 'user', content: 'faster' } },
    };
    const state = readFxLogState({
      log: createStubLog({
        submissions: [prompt('p1'), steer, prompt('p2')],
        undelivered: [steer, prompt('p2')],
        turns: [{ submissions: [prompt('p1')], finish: finishTurn }],
        effects: [
          attempt({ key: 'turn:0', output: { type: 'result', value: null } }),
          attempt({
            key: 'catalog:0:0',
            output: { type: 'result', value: { status: 200, body: '{}' } },
          }),
          attempt({
            key: 'model:0:0',
            input: { digest: 'abc', model: 'model-1' },
          }),
          attempt({
            key: 'tool:call-1',
            output: { type: 'result', value: { raw: 'done' } },
          }),
          attempt({ key: 'tool:call-2' }),
          attempt({
            key: 'checkpoint:0',
            output: { type: 'result', value: checkpoint },
          }),
        ],
      }),
    });

    expect(state.prompts.map(item => item.id)).toEqual(['p1', 'p2']);
    expect(state.pendingPrompts.map(item => item.id)).toEqual(['p2']);
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      index: 0,
      prompt: { id: 'p1' },
      ended: true,
      checkpoint: { finishReason: { unified: 'stop', raw: 'end_turn' } },
    });
    expect(state.turns[0].checkpoint?.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(state.modelEffects).toEqual(
      new Map([
        [
          'model:0:0',
          {
            turnIndex: 0,
            ordinal: 0,
            input: { digest: 'abc', model: 'model-1' },
          },
        ],
      ]),
    );
    expect(state.catalogOutputs).toEqual(
      new Map([
        ['catalog:0:0', { type: 'result', value: { status: 200, body: '{}' } }],
      ]),
    );
    expect(state.toolOutputs).toEqual(
      new Map([['call-1', { type: 'result', value: { raw: 'done' } }]]),
    );
  });

  test('reads an unfinished turn without a checkpoint', () => {
    const state = readFxLogState({
      log: createStubLog({
        submissions: [prompt('p1')],
        turns: [{ submissions: [prompt('p1')] }],
        effects: [
          attempt({ key: 'turn:0', output: { type: 'result', value: null } }),
          attempt({
            key: 'checkpoint:0',
            output: { type: 'error', error: { message: 'failed' } },
          }),
        ],
      }),
    });

    expect(state.turns).toMatchObject([{ index: 0, ended: false }]);
    expect(state.turns[0].checkpoint).toBeUndefined();
  });
});
