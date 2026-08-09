import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ClaudeMessage,
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from './create-emit-stream-event';

const FAILURE_SIGNAL =
  'ISSUE_18618_PRIMARY_FAILURE: finish-step usage used subagent tokens; subagent tool events leaked into the main step';

describe('issue #18618', () => {
  it('keeps subagent messages out of the main Agent-tool step', () => {
    const messages = JSON.parse(
      readFileSync(
        new URL('./__fixtures__/subagent-step-stream.json', import.meta.url),
        'utf8',
      ),
    ) as ClaudeMessage[];
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

    for (const message of messages) {
      emitStreamEvent(message);
    }

    const finishStep = emitted.find(event => event.type === 'finish-step');
    const leakedSubagentEvents = emitted
      .filter(
        event =>
          (event.type === 'tool-call' || event.type === 'tool-result') &&
          typeof event.toolCallId === 'string' &&
          event.toolCallId.startsWith('toolu_subagent_'),
      )
      .map(event => ({
        type: event.type,
        toolCallId: event.toolCallId,
      }));

    expect(
      {
        finishStepUsage: finishStep?.usage,
        leakedSubagentEvents,
      },
      FAILURE_SIGNAL,
    ).toEqual({
      finishStepUsage: {
        inputTokens: {
          total: 7905,
          noCache: 2,
          cacheRead: 2298,
          cacheWrite: 5605,
        },
        outputTokens: {
          total: 5,
          text: 5,
        },
      },
      leakedSubagentEvents: [],
    });
  });
});
