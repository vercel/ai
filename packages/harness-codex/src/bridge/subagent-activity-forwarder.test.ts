import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { CodexAppServerNotification } from './codex-app-server-client';
import { createCodexStepTracker, defaultUsage } from './codex-step-tracker';
import { createAppServerEventHandler } from './create-app-server-event-handler';
import { createEmitStreamEvent } from './create-emit-stream-event';
import {
  createSubagentActivityForwarder,
  type SubagentActivityForwarder,
} from './subagent-activity-forwarder';

// Trimmed Codex 0.160.1 app-server streams: one main turn that starts
// subagents and waits for them. v1 ran on gpt-5.5, v2 on gpt-6.1-sol.
const multiAgentV1 = readNotifications(
  'app-server-multi-agent-v1-spawn-and-wait.jsonl',
);
const multiAgentV2 = readNotifications(
  'app-server-multi-agent-v2-spawn-and-wait.jsonl',
);

const mainThreadId = '01a15f6d-441e-76e1-a1b2-eb781287ad13';
const mainTurnId = '01a15f6d-442a-7883-b668-de597f006e7c';
const earlierMainTurnId = '01a15f6d-3f10-7c55-9d0e-1b2c3d4e5f60';
const subagentThreadId = '01a15f6d-53c0-7663-bb4f-ca2c5d11bfc6';
const subagentTurnId = '01a15f6d-53c6-7a72-bbef-c33399a48cb5';
const nestedSubagentThreadId = '01a15f6d-6a01-7d10-8e2f-3a4b5c6d7e8f';
const otherSubagentThreadId = '01a15f6d-7b02-7e21-9f30-4b5c6d7e8f90';

describe('createSubagentActivityForwarder', () => {
  it("forwards a multi-agent v1 subagent's work, learned from collabAgentToolCall receiverThreadIds", () => {
    const response = startResponse({ notifications: multiAgentV1 });

    multiAgentV1.forEach(response.receive);

    // 14 spawn started (no receiver yet), 17 spawn completed names the child,
    // then the child's status (15) that arrived before it. The child's
    // warning (16) stays a warning.
    expect(response.rawValues()).toEqual(
      [
        14, 17, 15, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
        34, 35,
      ].map(index => multiAgentV1[index]),
    );
    expect(response.emitWarning).toHaveBeenCalledWith({
      message: (multiAgentV1[16]!.params as { message: string }).message,
    });
  });

  it('forwards multi-agent v2 subagents announced by subAgentActivity', () => {
    const response = startResponse({ notifications: multiAgentV2 });

    multiAgentV2.forEach(response.receive);

    // The first subAgentActivity started item (11) is followed by the status
    // its subagent sent before it (10).
    expect(response.rawValues()).toEqual(
      [
        11, 10, 12, 13, 14, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29,
        30, 31, 32, 33, 34, 35, 36, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48,
        49, 50, 51, 52,
      ].map(index => multiAgentV2[index]),
    );
  });

  it.each([
    ['v1', multiAgentV1],
    ['v2', multiAgentV2],
  ])(
    "leaves the main turn's parts, usage and warnings unchanged (multi-agent %s)",
    (_version, notifications) => {
      const withForwarder = startResponse({ notifications });
      const withoutForwarder = startResponse({
        notifications,
        forwardSubagentActivity: false,
      });

      notifications.forEach(withForwarder.receive);
      notifications.forEach(withoutForwarder.receive);

      expect(withForwarder.mainTurnParts()).toEqual(withoutForwarder.emitted);
      expect(withForwarder.mainTurnParts()).toContainEqual(
        expect.objectContaining({ type: 'finish-step' }),
      );
      expect(withForwarder.getTurnUsage()).toEqual(
        withoutForwarder.getTurnUsage(),
      );
      expect(withForwarder.emitWarning.mock.calls).toEqual(
        withoutForwarder.emitWarning.mock.calls,
      );
    },
  );

  it('forwards subAgentActivity and collabAgentToolCall items from the main thread', () => {
    const response = startResponse({});
    const waitStarted = collabAgentToolCall({
      method: 'item/started',
      tool: 'wait',
      receiverThreadIds: [],
    });

    response.receive(subagentStarted());
    response.receive(waitStarted);

    expect(response.rawValues()).toEqual([subagentStarted(), waitStarted]);
  });

  it("forwards a known subagent thread's notifications and keeps them out of the main turn", () => {
    const response = startResponse({});
    response.receive(subagentStarted());
    const usage = subagentNotification({
      method: 'thread/tokenUsage/updated',
      params: {
        tokenUsage: {
          total: usageBreakdown({ input: 12946, output: 33 }),
          last: usageBreakdown({ input: 12946, output: 33 }),
          modelContextWindow: 258400,
        },
      },
    });

    response.receive(subagentCommandCompleted());
    response.receive(usage);
    response.receive({
      method: 'turn/completed',
      params: {
        threadId: mainThreadId,
        turn: { id: mainTurnId, status: 'completed' },
      },
    });

    expect(response.rawValues()).toEqual([
      subagentStarted(),
      subagentCommandCompleted(),
      usage,
    ]);
    expect(response.mainTurnParts()).toEqual([
      { type: 'bridge-thread', threadId: mainThreadId },
    ]);
    expect(response.getTurnUsage()).toMatchObject({
      inputTokens: { total: 0 },
      outputTokens: { total: 0 },
    });
  });

  it('holds a thread until an item announces it as a subagent, then forwards its notifications in order', () => {
    const response = startResponse({});

    response.receive(subagentTurnStarted());
    response.receive(subagentCommandCompleted());
    expect(response.rawValues()).toEqual([]);

    response.receive(subagentStarted());
    expect(response.rawValues()).toEqual([
      subagentStarted(),
      subagentTurnStarted(),
      subagentCommandCompleted(),
    ]);
  });

  it("forwards only the announced thread's held notifications, up to 200 per thread", () => {
    const response = startResponse({});
    const otherTurnStarted = subagentTurnStarted({
      threadId: otherSubagentThreadId,
    });
    response.receive(otherTurnStarted);
    const deltas = Array.from({ length: 201 }, (_, index) =>
      subagentNotification({
        method: 'item/agentMessage/delta',
        params: { itemId: 'msg-1', delta: `${index}` },
      }),
    );
    deltas.forEach(response.receive);

    response.receive(subagentStarted());

    expect(response.rawValues()).toEqual([
      subagentStarted(),
      ...deltas.slice(0, 200),
    ]);
  });

  it('forwards a subagent that send_input gives a task (interacted)', () => {
    const response = startResponse({});
    const subagentInteracted = subagentActivity({ kind: 'interacted' });

    response.receive(subagentInteracted);
    response.receive(subagentTurnStarted());

    expect(response.rawValues()).toEqual([
      subagentInteracted,
      subagentTurnStarted(),
    ]);
  });

  it('forwards main-thread subagent items stamped with an earlier turn', () => {
    const response = startResponse({});
    response.receive(subagentStarted());
    const subagentCompleted = subagentActivity({
      kind: 'completed',
      method: 'item/completed',
      turnId: earlierMainTurnId,
    });

    response.receive(subagentCompleted);

    expect(response.rawValues()).toEqual([
      subagentStarted(),
      subagentCompleted,
    ]);
    expect(response.mainTurnParts()).toEqual([
      { type: 'bridge-thread', threadId: mainThreadId },
    ]);
  });

  it('forwards a subagent started by a multi-agent v2 subagent (nested)', () => {
    const response = startResponse({});
    response.receive(subagentStarted());
    const nestedTurnStarted = subagentTurnStarted({
      threadId: nestedSubagentThreadId,
    });
    const nestedStarted = subagentActivity({
      threadId: subagentThreadId,
      turnId: subagentTurnId,
      agentThreadId: nestedSubagentThreadId,
    });
    const nestedCommandCompleted = subagentCommandCompleted({
      threadId: nestedSubagentThreadId,
    });

    response.receive(nestedTurnStarted);
    response.receive(nestedStarted);
    response.receive(nestedCommandCompleted);

    expect(response.rawValues()).toEqual([
      subagentStarted(),
      nestedStarted,
      nestedTurnStarted,
      nestedCommandCompleted,
    ]);
  });

  it('forwards a subagent spawned by a multi-agent v1 subagent (nested)', () => {
    const response = startResponse({});
    const spawnCompleted = collabAgentToolCall({
      method: 'item/completed',
      tool: 'spawnAgent',
      receiverThreadIds: [subagentThreadId],
    });
    response.receive(spawnCompleted);
    const nestedSpawnCompleted = collabAgentToolCall({
      method: 'item/completed',
      tool: 'spawnAgent',
      threadId: subagentThreadId,
      turnId: subagentTurnId,
      receiverThreadIds: [nestedSubagentThreadId],
    });
    const nestedTurnStarted = subagentTurnStarted({
      threadId: nestedSubagentThreadId,
    });

    response.receive(nestedSpawnCompleted);
    response.receive(nestedTurnStarted);

    expect(response.rawValues()).toEqual([
      spawnCompleted,
      nestedSpawnCompleted,
      nestedTurnStarted,
    ]);
  });

  it("does not forward a subagent's reasoning or command output deltas", () => {
    const response = startResponse({});
    response.receive(subagentStarted());

    for (const method of [
      'item/reasoning/summaryTextDelta',
      'item/reasoning/summaryPartAdded',
      'item/reasoning/textDelta',
      'item/commandExecution/outputDelta',
    ]) {
      response.receive(
        subagentNotification({
          method,
          params: { itemId: 'rs-1', delta: 'Counting lines.', summaryIndex: 0 },
        }),
      );
    }

    expect(response.rawValues()).toEqual([subagentStarted()]);
    expect(response.mainTurnParts()).toEqual([
      { type: 'bridge-thread', threadId: mainThreadId },
    ]);
  });

  it('holds subagent activity between responses and forwards it when the next response starts', () => {
    const forwarder = createSubagentActivityForwarder({ mainThreadId });
    const first = startResponse({ forwarder });
    first.receive(subagentStarted());
    forwarder.stopForwardingToResponse();
    const subagentCompleted = subagentActivity({
      kind: 'completed',
      method: 'item/completed',
    });
    const deltas = Array.from({ length: 201 }, (_, index) =>
      subagentNotification({
        method: 'item/agentMessage/delta',
        params: { itemId: 'msg-1', delta: `${index}` },
      }),
    );

    expect(forwarder.forwardIfSubagentActivity(subagentTurnCompleted())).toBe(
      true,
    );
    deltas.forEach(delta => forwarder.forwardIfSubagentActivity(delta));
    forwarder.forwardIfSubagentActivity(subagentCompleted);
    expect(
      forwarder.forwardIfSubagentActivity(
        subagentTurnStarted({ threadId: otherSubagentThreadId }),
      ),
    ).toBe(false);
    const second = startResponse({ forwarder });

    expect(second.rawValues()).toEqual([
      subagentTurnCompleted(),
      ...deltas.slice(0, 199),
      subagentCompleted,
    ]);
  });

  it('drops held notifications of threads never announced when the response ends', () => {
    const forwarder = createSubagentActivityForwarder({ mainThreadId });
    const first = startResponse({ forwarder });
    first.receive(subagentTurnStarted());
    forwarder.stopForwardingToResponse();
    const second = startResponse({ forwarder });

    second.receive(subagentStarted());
    second.receive(subagentCommandCompleted());

    expect(first.rawValues()).toEqual([]);
    expect(second.rawValues()).toEqual([
      subagentStarted(),
      subagentCommandCompleted(),
    ]);
  });
});

// One response as the driver runs it: subagent activity goes to the
// forwarder, everything else to the main turn's handler.
function startResponse({
  notifications,
  forwarder,
  forwardSubagentActivity = true,
}: {
  notifications?: CodexAppServerNotification[];
  forwarder?: SubagentActivityForwarder;
  forwardSubagentActivity?: boolean;
}) {
  const emitted: Array<Record<string, unknown>> = [];
  let turnUsage: Record<string, unknown> = defaultUsage();
  const emitWarning = vi.fn();
  const stepTracker = createCodexStepTracker({
    send: event => emitted.push(event),
  });
  const handler = createAppServerEventHandler({
    stepTracker,
    emitStreamEvent: createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker,
      setTurnUsage: usage => (turnUsage = usage),
      setThreadId: () => {},
      emitWarning,
      emitError: vi.fn(),
    }),
    emitWarning,
    emitError: vi.fn(),
  });
  const responseMainThreadId =
    notifications == null ? mainThreadId : readMainThreadId(notifications);
  const responseForwarder = forwardSubagentActivity
    ? (forwarder ??
      createSubagentActivityForwarder({ mainThreadId: responseMainThreadId }))
    : undefined;
  if (notifications == null) {
    handler.announceThread(mainThreadId);
    handler.setTurnId(mainTurnId);
  }
  responseForwarder?.startForwardingToResponse({
    emitRawPart: rawValue => emitted.push({ type: 'raw', rawValue }),
  });
  return {
    emitted,
    emitWarning,
    getTurnUsage: () => turnUsage,
    receive: (notification: CodexAppServerNotification) => {
      if (responseForwarder?.forwardIfSubagentActivity(notification)) return;
      handler.handle(notification);
    },
    rawValues: () =>
      emitted.filter(part => part.type === 'raw').map(part => part.rawValue),
    mainTurnParts: () => emitted.filter(part => part.type !== 'raw'),
  };
}

function readNotifications(fileName: string): CodexAppServerNotification[] {
  return readFileSync(new URL(`./__fixtures__/${fileName}`, import.meta.url), {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as CodexAppServerNotification);
}

function readMainThreadId(notifications: CodexAppServerNotification[]): string {
  const threadStarted = notifications.find(
    notification => notification.method === 'thread/started',
  )!;
  return (threadStarted.params as { thread: { id: string } }).thread.id;
}

function subagentActivity({
  method = 'item/started',
  kind = 'started',
  threadId = mainThreadId,
  turnId = mainTurnId,
  agentThreadId = subagentThreadId,
}: {
  method?: string;
  kind?: string;
  threadId?: string;
  turnId?: string;
  agentThreadId?: string;
}): CodexAppServerNotification {
  return {
    method,
    params: {
      item: {
        type: 'subAgentActivity',
        id: `call_${kind}_${agentThreadId.slice(-4)}`,
        kind,
        agentThreadId,
        agentPath: '/root/helper_1',
      },
      threadId,
      turnId,
    },
  };
}

function subagentStarted(): CodexAppServerNotification {
  return subagentActivity({});
}

function collabAgentToolCall({
  method,
  tool,
  threadId = mainThreadId,
  turnId = mainTurnId,
  receiverThreadIds,
}: {
  method: string;
  tool: string;
  threadId?: string;
  turnId?: string;
  receiverThreadIds: string[];
}): CodexAppServerNotification {
  return {
    method,
    params: {
      item: {
        type: 'collabAgentToolCall',
        id: `call_${tool}`,
        tool,
        status: method === 'item/started' ? 'inProgress' : 'completed',
        senderThreadId: threadId,
        receiverThreadIds,
        prompt: null,
        model: null,
        reasoningEffort: null,
        agentsStates: {},
      },
      threadId,
      turnId,
    },
  };
}

function subagentNotification({
  method,
  threadId = subagentThreadId,
  params,
}: {
  method: string;
  threadId?: string;
  params?: Record<string, unknown>;
}): CodexAppServerNotification {
  return { method, params: { threadId, turnId: subagentTurnId, ...params } };
}

function subagentTurnStarted({
  threadId = subagentThreadId,
}: { threadId?: string } = {}): CodexAppServerNotification {
  return {
    method: 'turn/started',
    params: { threadId, turn: { id: subagentTurnId, status: 'inProgress' } },
  };
}

function subagentTurnCompleted(): CodexAppServerNotification {
  return {
    method: 'turn/completed',
    params: {
      threadId: subagentThreadId,
      turn: { id: subagentTurnId, status: 'completed' },
    },
  };
}

function subagentCommandCompleted({
  threadId = subagentThreadId,
}: { threadId?: string } = {}): CodexAppServerNotification {
  return subagentNotification({
    method: 'item/completed',
    threadId,
    params: {
      item: {
        type: 'commandExecution',
        id: 'exec-0a0e5f94-a032-4a81-b78a-2b5d9111e6a9',
        command: "/bin/zsh -lc 'wc -l < ./sample.txt'",
        cwd: '/workspace',
        status: 'completed',
        aggregatedOutput: '       7\n',
        exitCode: 0,
      },
    },
  });
}

function usageBreakdown({
  input,
  output,
}: {
  input: number;
  output: number;
}): Record<string, number> {
  return {
    totalTokens: input + output,
    inputTokens: input,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: output,
    reasoningOutputTokens: 0,
  };
}
