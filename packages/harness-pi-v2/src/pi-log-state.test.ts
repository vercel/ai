import type {
  HarnessV2Log,
  HarnessV2LogEffectAttempt,
  HarnessV2LogSubmissionEvent,
  HarnessV2LogTurn,
} from '@ai-sdk/harness';
import { describe, expect, test } from 'vitest';
import {
  hasPendingCancel,
  readPiLogState,
  restorePiTranscript,
  type PiLogState,
  type PiModelEffectRecord,
} from './pi-log-state';

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

const finishTurn = {
  type: 'finish-turn',
  id: 'finish',
  data: {
    turnId: 'opaque',
    finishReason: { unified: 'stop', raw: 'stop' },
    totalUsage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
  },
} as const;

/**
 * Returns a log whose lookups return the given values as they are.
 */
function createStubLog(options: {
  submissions?: HarnessV2LogSubmissionEvent[];
  undelivered?: HarnessV2LogSubmissionEvent[];
  effects?: HarnessV2LogEffectAttempt[];
  currentTurn?: HarnessV2LogTurn;
}): HarnessV2Log {
  const { submissions = [], effects = [], currentTurn } = options;
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
    getCurrentTurn: () => currentTurn,
    getTurns: () => (currentTurn == null ? [] : [currentTurn]),
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
      settings,
    },
  };
}

function attempt(options: {
  key: string;
  appended?: unknown[];
  delivered?: string[];
  value?: unknown;
}): HarnessV2LogEffectAttempt {
  const start = {
    type: 'effect-start',
    id: `start-${options.key}`,
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
  } as const;
  if (!Object.hasOwn(options, 'value')) return { start };
  return {
    start,
    end: {
      type: 'effect-end',
      id: `end-${options.key}`,
      data: {
        startId: start.id,
        output: { type: 'result', value: options.value as never },
      },
    },
  };
}

function modelEffect(options: {
  ordinal: number;
  appended: unknown[];
  output?: unknown;
}): PiModelEffectRecord {
  return {
    ordinal: options.ordinal,
    input: {
      appended: options.appended as never,
      contextLength: 0,
      model: 'faux/faux-1',
    },
    deliveredSubmissionIds: [],
    ...(options.output !== undefined && {
      output: { type: 'result', value: options.output as never },
    }),
  };
}

function state(options: Partial<PiLogState>): PiLogState {
  return {
    prompts: [],
    pendingPrompts: [],
    modelEffects: [],
    toolOutputs: new Map(),
    ...options,
  };
}

describe('readPiLogState', () => {
  test('reports whether a cancel waits for delivery', () => {
    const cancel: HarnessV2LogSubmissionEvent = {
      type: 'submission',
      id: 'c1',
      data: { type: 'cancel' },
    };

    expect(
      hasPendingCancel({
        log: createStubLog({ undelivered: [prompt('p2'), cancel] }),
      }),
    ).toBe(true);
    expect(
      hasPendingCancel({ log: createStubLog({ undelivered: [prompt('p2')] }) }),
    ).toBe(false);
  });

  test('reads prompts, pending prompts, model effects and tool outputs', () => {
    const steer: HarnessV2LogSubmissionEvent = {
      type: 'submission',
      id: 's1',
      data: { type: 'steer', message: { role: 'user', content: 'faster' } },
    };
    const toolUse = assistant({
      content: [{ type: 'toolCall', id: 'c1', name: 'read', arguments: {} }],
      stopReason: 'toolUse',
    });
    const result = readPiLogState({
      log: createStubLog({
        submissions: [prompt('p1'), steer, prompt('p2')],
        undelivered: [steer, prompt('p2')],
        effects: [
          attempt({
            key: 'model:1',
            appended: [{ role: 'toolResult', toolCallId: 'c1' }],
          }),
          attempt({
            key: 'model:0',
            appended: [user('p1')],
            delivered: ['p1'],
            value: toolUse,
          }),
          attempt({ key: 'tool:c1', value: { raw: 'file' } }),
          attempt({ key: 'tool:c2' }),
          attempt({ key: 'model:summary' }),
        ],
        currentTurn: { submissions: [prompt('p1')] },
      }),
    });

    expect(result.prompts.map(item => item.id)).toEqual(['p1', 'p2']);
    expect(result.pendingPrompts.map(item => item.id)).toEqual(['p2']);
    expect(result.modelEffects).toEqual([
      {
        ordinal: 0,
        input: {
          appended: [user('p1')],
          contextLength: 0,
          model: 'faux/faux-1',
        },
        deliveredSubmissionIds: ['p1'],
        output: { type: 'result', value: toolUse },
      },
      {
        ordinal: 1,
        input: {
          appended: [{ role: 'toolResult', toolCallId: 'c1' }],
          contextLength: 0,
          model: 'faux/faux-1',
        },
        deliveredSubmissionIds: [],
      },
    ]);
    expect(result.toolOutputs).toEqual(
      new Map([['c1', { type: 'result', value: { raw: 'file' } }]]),
    );
    expect(result.currentTurn).toEqual({
      prompt: {
        id: 'p1',
        message: { role: 'user', content: 'p1' },
        settings,
      },
      firstModelOrdinal: 0,
      ended: false,
    });
  });

  test('marks the current turn ended once it finished', () => {
    const result = readPiLogState({
      log: createStubLog({
        submissions: [prompt('p1')],
        effects: [attempt({ key: 'model:0', delivered: ['p1'] })],
        currentTurn: { submissions: [prompt('p1')], finish: finishTurn },
      }),
    });

    expect(result.currentTurn?.ended).toBe(true);
  });

  test('starts the current turn at the first model effect that delivered its prompt', () => {
    const result = readPiLogState({
      log: createStubLog({
        submissions: [prompt('p1'), prompt('p2')],
        effects: [
          attempt({ key: 'model:0', delivered: ['p1'] }),
          attempt({ key: 'model:3', delivered: ['p2'] }),
          attempt({ key: 'model:2', delivered: ['p2'] }),
        ],
        currentTurn: { submissions: [prompt('p2')] },
      }),
    });

    expect(result.currentTurn?.firstModelOrdinal).toBe(2);
  });

  test('has no current turn while no model effect delivered its prompt', () => {
    const result = readPiLogState({
      log: createStubLog({
        submissions: [prompt('p1')],
        effects: [attempt({ key: 'tool:c1', delivered: ['p1'] })],
        currentTurn: { submissions: [prompt('p1')] },
      }),
    });

    expect(result.currentTurn).toBeUndefined();
  });
});

describe('restorePiTranscript', () => {
  const isBuiltinTool = () => true;

  test('starts empty without model effects', () => {
    expect(restorePiTranscript({ state: state({}), isBuiltinTool })).toEqual({
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
      state: state({
        modelEffects: [
          modelEffect({
            ordinal: 0,
            appended: [system, user('first')],
            output: toolUse,
          }),
          modelEffect({ ordinal: 1, appended: [result] }),
        ],
        currentTurn: {
          prompt: {
            id: 'p1',
            message: { role: 'user', content: 'first' },
            settings,
          },
          firstModelOrdinal: 0,
          ended: false,
        },
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
      state: state({
        modelEffects: [
          modelEffect({
            ordinal: 0,
            appended: [system, user('first')],
            output: toolUse,
          }),
        ],
        toolOutputs: new Map([
          [
            'c1',
            {
              type: 'result',
              value: { raw: { content: [{ type: 'text', text: 'contents' }] } },
            },
          ],
        ]),
        currentTurn: {
          prompt: {
            id: 'p1',
            message: { role: 'user', content: 'first' },
            settings,
          },
          firstModelOrdinal: 0,
          ended: true,
        },
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
