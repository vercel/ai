import type {
  AnyMessage,
  SessionUpdate,
  Stream as ACPStream,
} from '@agentclientprotocol/sdk';

const KNOWN_SESSION_UPDATES = new Set([
  'user_message_chunk',
  'agent_message_chunk',
  'agent_thought_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
  'plan_update',
  'plan_removed',
  'available_commands_update',
  'current_mode_update',
  'config_option_update',
  'session_info_update',
  'usage_update',
]);

type CapturedSessionUpdate = {
  readonly rawUpdate: unknown;
  readonly forwarded: boolean;
};

export type ACPStreamCapture = {
  takeForUpdate(options: { update: SessionUpdate }): {
    readonly precedingRawValues: ReadonlyArray<unknown>;
    readonly rawUpdate: unknown;
  };
  drainRawValues(): ReadonlyArray<unknown>;
};

export function captureACPStream({ stream }: { stream: ACPStream }): {
  stream: ACPStream;
  capture: ACPStreamCapture;
} {
  const updates: CapturedSessionUpdate[] = [];
  const readable = stream.readable.pipeThrough(
    new TransformStream<AnyMessage, AnyMessage>({
      transform(message, controller) {
        const rawUpdate = getRawSessionUpdate({ message });
        if (!rawUpdate.isSessionUpdate) {
          controller.enqueue(message);
          return;
        }

        const sessionUpdate = getStringProperty({
          value: rawUpdate.value,
          property: 'sessionUpdate',
        });
        const forwarded =
          !rawUpdate.canFilterUnknown ||
          sessionUpdate == null ||
          KNOWN_SESSION_UPDATES.has(sessionUpdate);
        updates.push({ rawUpdate: rawUpdate.value, forwarded });
        if (forwarded) controller.enqueue(message);
      },
    }),
  );

  return {
    stream: { ...stream, readable },
    capture: {
      takeForUpdate: ({ update }) => {
        const index = updates.findIndex(
          candidate =>
            candidate.forwarded &&
            sessionUpdatesMatch({
              rawUpdate: candidate.rawUpdate,
              update,
            }),
        );
        if (index === -1) {
          return { precedingRawValues: [], rawUpdate: update };
        }
        const consumed = updates.splice(0, index + 1);
        return {
          precedingRawValues: consumed
            .slice(0, -1)
            .map(candidate => candidate.rawUpdate),
          rawUpdate: consumed.at(-1)!.rawUpdate,
        };
      },
      drainRawValues: () =>
        updates.splice(0).map(candidate => candidate.rawUpdate),
    },
  };
}

function getRawSessionUpdate({ message }: { message: AnyMessage }):
  | { readonly isSessionUpdate: false }
  | {
      readonly isSessionUpdate: true;
      readonly value: unknown;
      readonly canFilterUnknown: boolean;
    } {
  const record = message as unknown as Record<string, unknown>;
  if (record.method !== 'session/update' || !isRecord(record.params)) {
    return { isSessionUpdate: false };
  }
  const params = record.params;
  return {
    isSessionUpdate: true,
    value: params.update,
    canFilterUnknown:
      typeof params.sessionId === 'string' && isRecord(params.update),
  };
}

function sessionUpdatesMatch({
  rawUpdate,
  update,
}: {
  rawUpdate: unknown;
  update: SessionUpdate;
}): boolean {
  if (!isRecord(rawUpdate)) return false;
  if (rawUpdate.sessionUpdate !== update.sessionUpdate) return false;
  if (
    update.sessionUpdate === 'tool_call' ||
    update.sessionUpdate === 'tool_call_update'
  ) {
    return rawUpdate.toolCallId === update.toolCallId;
  }
  if (
    update.sessionUpdate === 'user_message_chunk' ||
    update.sessionUpdate === 'agent_message_chunk' ||
    update.sessionUpdate === 'agent_thought_chunk'
  ) {
    return rawUpdate.messageId === update.messageId;
  }
  return true;
}

function getStringProperty({
  value,
  property,
}: {
  value: unknown;
  property: string;
}): string | undefined {
  if (!isRecord(value)) return undefined;
  const propertyValue = value[property];
  return typeof propertyValue === 'string' ? propertyValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
