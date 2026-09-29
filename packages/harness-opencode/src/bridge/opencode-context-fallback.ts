export type AssistantSnapshotBaseline = {
  assistantExisted: boolean;
  assistantId?: string;
};

export function createAssistantSnapshotBaseline(
  assistant: { id?: unknown } | undefined,
): AssistantSnapshotBaseline {
  return {
    assistantExisted: assistant != null,
    ...(typeof assistant?.id === 'string' ? { assistantId: assistant.id } : {}),
  };
}

export function isAssistantSnapshotAfterBaseline({
  assistant,
  baseline,
}: {
  assistant: { id?: unknown };
  baseline: AssistantSnapshotBaseline;
}): boolean {
  if (typeof assistant.id !== 'string') return false;
  if (!baseline.assistantExisted) return true;
  return baseline.assistantId != null && assistant.id !== baseline.assistantId;
}
