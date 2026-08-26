import { describe, expect, it } from 'vitest';
import { OpenCodeSubagentUsageTracker } from './opencode-subagent-usage';

describe('OpenCodeSubagentUsageTracker', () => {
  it('emits bounded usage for task-linked descendant steps', () => {
    const emitted: Record<string, unknown>[] = [];
    const tracker = new OpenCodeSubagentUsageTracker('root-session', event =>
      emitted.push(event),
    );

    expect(
      tracker.handle({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'task',
            sessionID: 'root-session',
            state: {
              metadata: {
                parentSessionId: 'root-session',
                sessionId: 'child-session',
              },
            },
          },
        },
      }),
    ).toBe(false);
    expect(
      tracker.handle({
        type: 'message.updated',
        properties: {
          info: {
            id: 'child-message',
            sessionID: 'child-session',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
          },
        },
      }),
    ).toBe(true);

    const stepEvent = {
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'child-finish',
          type: 'step-finish',
          sessionID: 'child-session',
          messageID: 'child-message',
          tokens: {
            input: 3,
            output: 5,
            reasoning: 1,
            cache: { read: 10, write: 2 },
          },
          cost: 0.0042,
          reasoning: 'must not be exposed',
        },
      },
    };
    expect(tracker.handle(stepEvent)).toBe(true);
    expect(tracker.handle(stepEvent)).toBe(true);

    expect(emitted).toEqual([
      {
        type: 'raw',
        rawValue: {
          type: 'opencode.subagent-usage',
          version: 1,
          sessionId: 'child-session',
          stepId: 'child-message',
          modelId: 'openai/gpt-5',
          usage: {
            inputTokens: {
              total: 3,
              noCache: 0,
              cacheRead: 10,
              cacheWrite: 2,
            },
            outputTokens: { total: 6, text: 5, reasoning: 1 },
          },
          cost: 0.0042,
        },
      },
    ]);
  });

  it('tracks nested descendants without exposing unrelated sessions', () => {
    const emitted: Record<string, unknown>[] = [];
    const tracker = new OpenCodeSubagentUsageTracker('root-session', event =>
      emitted.push(event),
    );

    tracker.handle({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'tool',
          tool: 'task',
          sessionID: 'root-session',
          state: {
            metadata: {
              parentSessionId: 'root-session',
              sessionId: 'child-session',
            },
          },
        },
      },
    });
    tracker.handle({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'tool',
          tool: 'agent',
          sessionID: 'child-session',
          state: {
            metadata: {
              parentSessionId: 'child-session',
              sessionId: 'grandchild-session',
            },
          },
        },
      },
    });
    tracker.handle({
      type: 'message.updated',
      properties: {
        info: {
          id: 'grandchild-message',
          sessionID: 'grandchild-session',
          role: 'assistant',
          providerID: 'anthropic',
          modelID: 'claude',
        },
      },
    });
    tracker.handle({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'step-finish',
          sessionID: 'grandchild-session',
          messageID: 'grandchild-message',
          tokens: {
            input: 1,
            output: 2,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          cost: 0.01,
        },
      },
    });
    tracker.handle({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'step-finish',
          sessionID: 'unrelated-session',
          messageID: 'unrelated-message',
          tokens: {
            input: 100,
            output: 200,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          cost: 1,
        },
      },
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      rawValue: {
        sessionId: 'grandchild-session',
        stepId: 'grandchild-message',
        modelId: 'anthropic/claude',
      },
    });
  });
});
