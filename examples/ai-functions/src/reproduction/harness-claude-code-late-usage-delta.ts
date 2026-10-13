import assert from 'node:assert/strict';
import {
  type ClaudeMessage,
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from '../../../../packages/harness-claude-code/src/bridge/create-emit-stream-event';

type Ordering = 'tool-result-first' | 'delta-first' | 'stop-first';

const initial = [
  {
    input_tokens: 10,
    cache_creation_input_tokens: 20,
    cache_read_input_tokens: 30,
    output_tokens: 3,
  },
  {
    input_tokens: 40,
    cache_creation_input_tokens: 50,
    cache_read_input_tokens: 60,
    output_tokens: 3,
  },
];

const final = [
  {
    input_tokens: 110,
    cache_creation_input_tokens: 220,
    cache_read_input_tokens: 330,
    output_tokens: 295,
  },
  {
    input_tokens: 140,
    cache_creation_input_tokens: 250,
    cache_read_input_tokens: 360,
    output_tokens: 233,
  },
];

function mapExpectedUsage(
  usage: (typeof initial)[number],
  outputTokens: number,
) {
  return {
    inputTokens: {
      total:
        usage.input_tokens +
        usage.cache_creation_input_tokens +
        usage.cache_read_input_tokens,
      noCache: usage.input_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheWrite: usage.cache_creation_input_tokens,
    },
    outputTokens: { total: outputTokens, text: outputTokens },
  };
}

function replay({
  order,
  outputOnly,
}: {
  order: Ordering;
  outputOnly: boolean;
}) {
  const emitted: Record<string, unknown>[] = [];
  const receive = createEmitStreamEvent({
    state: createClaudeStreamEventState(),
    emit: event => emitted.push(event),
    emitWarning: () => {},
    emitTerminalError: () => {},
    onCompactionBoundary: () => {},
    toCommonName: name => name.toLowerCase(),
  });
  const stream = (
    event: NonNullable<ClaudeMessage['event']>,
  ): ClaudeMessage => ({
    type: 'stream_event',
    parent_tool_use_id: null,
    event,
  });

  for (let response = 0; response < 2; response++) {
    receive(
      stream({
        type: 'message_start',
        message: { usage: initial[response] },
      }),
    );

    // Two parallel tools and their partial block boundaries must complete
    // before the step can finish.
    for (let index = 0; index < 2; index++) {
      const id = `response-${response}-tool-${index}`;
      receive(
        stream({
          type: 'content_block_start',
          index,
          content_block: { type: 'tool_use', id, name: 'Read' },
        }),
      );
      receive({
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          usage: initial[response],
          content: [
            {
              type: 'tool_use',
              id,
              name: 'Read',
              input: { file_path: 'fixture.txt' },
            },
          ],
        },
      });
      receive(stream({ type: 'content_block_stop', index }));
    }

    const results: ClaudeMessage[] = [0, 1].map(index => ({
      type: 'user',
      parent_tool_use_id: null,
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: `response-${response}-tool-${index}`,
            content: 'ok',
          },
        ],
      },
    }));
    const delta = stream({
      type: 'message_delta',
      usage: outputOnly
        ? { output_tokens: final[response].output_tokens }
        : final[response],
    });
    const stop = stream({ type: 'message_stop' });

    const messages =
      order === 'tool-result-first'
        ? [...results, delta, stop]
        : order === 'delta-first'
          ? [delta, ...results, stop]
          : [delta, stop, ...results];
    for (const message of messages) {
      receive(message);
    }
  }

  return {
    finishStepUsage: emitted
      .filter(event => event.type === 'finish-step')
      .map(event => event.usage),
    rawStopUsage: emitted
      .filter(event => {
        const raw = event.rawValue as ClaudeMessage | undefined;
        return (
          event.type === 'raw' &&
          raw?.type === 'stream_event' &&
          raw.parent_tool_use_id == null &&
          raw.event?.type === 'message_stop'
        );
      })
      .map(event => (event.rawValue as ClaudeMessage).usage),
  };
}

async function main() {
  const failures: Array<{
    outputOnly: boolean;
    actual: unknown;
    expected: unknown;
  }> = [];

  for (const outputOnly of [false, true]) {
    const expected = (outputOnly ? initial : final).map((usage, index) =>
      mapExpectedUsage(usage, final[index].output_tokens),
    );
    const expectedRawStops = final.map((usage, index) =>
      outputOnly
        ? { ...initial[index], output_tokens: usage.output_tokens }
        : usage,
    );

    for (const order of [
      'tool-result-first',
      'delta-first',
      'stop-first',
    ] as const) {
      const actual = replay({ order, outputOnly });

      // Raw response completion usage and both control orderings must remain
      // correct; otherwise this is not the focused issue being reproduced.
      assert.deepStrictEqual(actual.rawStopUsage, expectedRawStops);
      if (order !== 'tool-result-first') {
        assert.deepStrictEqual(actual.finishStepUsage, expected);
        continue;
      }

      if (JSON.stringify(actual.finishStepUsage) !== JSON.stringify(expected)) {
        failures.push({
          outputOnly,
          actual: actual.finishStepUsage,
          expected,
        });
      }
    }
  }

  if (failures.length === 0) {
    console.log('Issue #23161 is not present: each response kept its usage.');
    return;
  }

  const knownBrokenUsage = [
    [
      mapExpectedUsage(initial[0], initial[0].output_tokens),
      mapExpectedUsage(final[0], final[0].output_tokens),
    ],
    [
      mapExpectedUsage(initial[0], initial[0].output_tokens),
      mapExpectedUsage(initial[1], final[0].output_tokens),
    ],
  ];
  assert.equal(failures.length, 2);
  assert.deepStrictEqual(
    failures.map(failure => failure.actual),
    knownBrokenUsage,
  );

  console.error(
    'ISSUE_23161_REPRODUCED: tool-result-first finish-step usage is attributed to the wrong response',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
