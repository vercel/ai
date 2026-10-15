import { describe, expect, it } from 'vitest';
import { createOpenCodeHostInputTracker } from './opencode-host-input-tracker';

describe('createOpenCodeHostInputTracker', () => {
  it('emits one early finish-step once every unsettled tool call waits on the host', () => {
    const emitted: Record<string, unknown>[] = [];
    const tracker = createOpenCodeHostInputTracker({
      emit: message => emitted.push(message),
    });

    tracker.observeToolCall({
      callID: 'bash-1',
      status: 'started',
      group: undefined,
    });
    tracker.observeToolCall({
      callID: 'weather-1',
      status: 'started',
      group: 'host-tool',
    });
    tracker.markGroupWaiting({ group: 'host-tool', id: 'relay-1' });

    expect(emitted).toEqual([]);

    tracker.markWaiting({ toolCallId: 'bash-1' });
    tracker.markWaiting({ toolCallId: 'bash-1' });

    expect(emitted).toMatchInlineSnapshot(`
      [
        {
          "finishReason": {
            "raw": "host-input",
            "unified": "tool-calls",
          },
          "harnessMetadata": {
            "opencode": {
              "inferredStep": true,
            },
          },
          "type": "finish-step",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": 0,
              "noCache": 0,
              "total": 0,
            },
            "outputTokens": {
              "text": 0,
              "total": 0,
            },
          },
        },
      ]
    `);
  });

  it('waits until every host tool call has a relay request', () => {
    const emitted: Record<string, unknown>[] = [];
    const tracker = createOpenCodeHostInputTracker({
      emit: message => emitted.push(message),
    });

    for (const callID of ['paris', 'tokyo']) {
      tracker.observeToolCall({
        callID,
        status: 'started',
        group: 'host-tool',
      });
    }
    tracker.markGroupWaiting({ group: 'host-tool', id: 'relay-paris' });

    expect(emitted).toHaveLength(0);

    tracker.markGroupWaiting({ group: 'host-tool', id: 'relay-tokyo' });

    expect(emitted).toHaveLength(1);
  });
});
