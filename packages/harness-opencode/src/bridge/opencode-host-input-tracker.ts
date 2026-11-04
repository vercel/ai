type Emit = (message: Record<string, unknown>) => void;

/*
 * Host input that cannot be attributed to an OpenCode call id. Host tool
 * relay requests carry their own ids, and permission requests or questions
 * raised inside a subagent belong to the parent's `agent` tool call. Calls of
 * such a group are matched to the group's waits by count.
 */
export type OpenCodeHostInputGroup = 'host-tool' | 'subagent';

export type OpenCodeHostInputTracker = {
  observeToolCall(input: {
    callID: string;
    status: 'started' | 'settled';
    group: OpenCodeHostInputGroup | undefined;
  }): void;
  markWaiting(input: { toolCallId: string }): void;
  clearWaiting(input: { toolCallId: string; settled?: boolean }): void;
  markGroupWaiting(input: { group: OpenCodeHostInputGroup; id: string }): void;
  clearGroupWaiting(input: { group: OpenCodeHostInputGroup; id: string }): void;
  observeFinishStep(): void;
};

/*
 * Tracks whether OpenCode can only make progress after host input: every tool
 * call that started and has not settled either waits on a permission request
 * or question, or belongs to a group with enough waits. In that case an early
 * `finish-step` lets the host pause the turn; the OpenCode step stays open
 * until its regular `finish-step`.
 */
export function createOpenCodeHostInputTracker({
  emit,
}: {
  emit: Emit;
}): OpenCodeHostInputTracker {
  const unsettledToolCalls = new Map<
    string,
    OpenCodeHostInputGroup | undefined
  >();
  const waitingToolCallIds = new Set<string>();
  const groupWaits = new Map<OpenCodeHostInputGroup, Set<string>>([
    ['host-tool', new Set()],
    ['subagent', new Set()],
  ]);
  const coveredIds = new Set<string>();

  const emitEarlyFinishStepIfReady = (): void => {
    if (unsettledToolCalls.size === 0) return;
    const notWaitingByGroup = new Map<OpenCodeHostInputGroup, number>();
    for (const [callID, group] of unsettledToolCalls) {
      if (waitingToolCallIds.has(callID)) continue;
      if (group == null) return;
      notWaitingByGroup.set(group, (notWaitingByGroup.get(group) ?? 0) + 1);
    }
    for (const [group, count] of notWaitingByGroup) {
      if (count > groupWaits.get(group)!.size) return;
    }
    const uncovered = [
      ...waitingToolCallIds,
      ...[...groupWaits.values()].flatMap(ids => [...ids]),
    ].filter(id => !coveredIds.has(id));
    if (uncovered.length === 0) return;
    for (const id of uncovered) coveredIds.add(id);
    emit({
      type: 'finish-step',
      finishReason: { unified: 'tool-calls', raw: 'host-input' },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0 },
      },
      harnessMetadata: { opencode: { inferredStep: true } },
    });
  };

  return {
    observeToolCall({ callID, status, group }) {
      if (status === 'started') {
        unsettledToolCalls.set(callID, group);
      } else {
        unsettledToolCalls.delete(callID);
      }
      emitEarlyFinishStepIfReady();
    },
    markWaiting({ toolCallId }) {
      if (!unsettledToolCalls.has(toolCallId)) {
        unsettledToolCalls.set(toolCallId, undefined);
      }
      waitingToolCallIds.add(toolCallId);
      emitEarlyFinishStepIfReady();
    },
    clearWaiting({ toolCallId, settled = false }) {
      waitingToolCallIds.delete(toolCallId);
      if (settled) unsettledToolCalls.delete(toolCallId);
    },
    markGroupWaiting({ group, id }) {
      groupWaits.get(group)!.add(id);
      emitEarlyFinishStepIfReady();
    },
    clearGroupWaiting({ group, id }) {
      groupWaits.get(group)!.delete(id);
    },
    observeFinishStep() {
      coveredIds.clear();
    },
  };
}
