import { getOpenCodeEventSessionId } from './opencode-events';
import { mapUsage } from './opencode-usage';
import { asOpenCodeObject, type OpenCodeEvent } from './opencode-types';

type Emit = (message: Record<string, unknown>) => void;

export class OpenCodeSubagentUsageTracker {
  private readonly descendantSessionIds = new Set<string>();
  private readonly messageModelIds = new Map<string, string>();
  private readonly emittedStepIds = new Set<string>();

  constructor(
    private readonly rootSessionId: string,
    private readonly emit: Emit,
  ) {}

  /**
   * Observes all-session OpenCode events before root-session translation.
   * Returns true when the event belongs to a non-root session and must not be
   * exposed through the normal content/tool translation path.
   */
  handle(event: OpenCodeEvent): boolean {
    this.trackTaskLinkedSession(event);

    const sessionId = getOpenCodeEventSessionId(event);
    if (!sessionId || sessionId === this.rootSessionId) return false;
    if (!this.descendantSessionIds.has(sessionId)) return true;

    if (event.type === 'message.updated') {
      this.trackMessageModel({ sessionId, info: event.properties?.info });
    } else if (event.type === 'message.part.updated') {
      this.emitStepUsage({ sessionId, part: event.properties?.part });
    }

    return true;
  }

  private isTrackedSession(sessionId: string): boolean {
    return (
      sessionId === this.rootSessionId ||
      this.descendantSessionIds.has(sessionId)
    );
  }

  private trackTaskLinkedSession(event: OpenCodeEvent): void {
    if (event.type !== 'message.part.updated') return;
    const part = asOpenCodeObject(event.properties?.part);
    if (part?.type !== 'tool' || !isSubagentToolName(stringValue(part.tool))) {
      return;
    }

    const state = asOpenCodeObject(part.state);
    const metadata = {
      ...asOpenCodeObject(part.metadata),
      ...asOpenCodeObject(state?.metadata),
    };
    const parentSessionId =
      stringValue(part.sessionID) ??
      stringValue(event.properties?.sessionID) ??
      stringValue(metadata.parentSessionId) ??
      stringValue(metadata.parentSessionID);
    const childSessionId =
      stringValue(metadata.sessionId) ?? stringValue(metadata.sessionID);

    if (
      parentSessionId &&
      childSessionId &&
      childSessionId !== this.rootSessionId &&
      this.isTrackedSession(parentSessionId)
    ) {
      this.descendantSessionIds.add(childSessionId);
    }
  }

  private trackMessageModel({
    sessionId,
    info: value,
  }: {
    sessionId: string;
    info: unknown;
  }): void {
    const info = asOpenCodeObject(value);
    if (info?.role !== 'assistant') return;
    const messageId = stringValue(info.id);
    const modelId = joinModelId({
      providerId: stringValue(info.providerID),
      modelId: stringValue(info.modelID),
    });
    if (messageId && modelId) {
      this.messageModelIds.set(messageKey({ sessionId, messageId }), modelId);
    }
  }

  private emitStepUsage({
    sessionId,
    part: value,
  }: {
    sessionId: string;
    part: unknown;
  }): void {
    const part = asOpenCodeObject(value);
    if (part?.type !== 'step-finish') return;
    const messageId = stringValue(part.messageID);
    if (!messageId) return;
    const dedupeId = stringValue(part.id) ?? messageId;
    const dedupeKey = messageKey({ sessionId, messageId: dedupeId });
    if (this.emittedStepIds.has(dedupeKey)) return;
    this.emittedStepIds.add(dedupeKey);

    const modelId = this.messageModelIds.get(
      messageKey({ sessionId, messageId }),
    );
    this.emit({
      type: 'raw',
      rawValue: {
        type: 'opencode.subagent-usage',
        version: 1,
        sessionId,
        stepId: messageId,
        ...(modelId ? { modelId } : {}),
        usage: mapUsage(part.tokens),
        ...(typeof part.cost === 'number' ? { cost: part.cost } : {}),
      },
    });
  }
}

function isSubagentToolName(value: string | undefined): boolean {
  return value === 'task' || value === 'agent' || value === 'subtask';
}

function messageKey({
  sessionId,
  messageId,
}: {
  sessionId: string;
  messageId: string;
}): string {
  return `${sessionId}\u0000${messageId}`;
}

function joinModelId({
  providerId,
  modelId,
}: {
  providerId: string | undefined;
  modelId: string | undefined;
}): string | undefined {
  if (providerId && modelId) return `${providerId}/${modelId}`;
  return modelId ?? providerId;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
