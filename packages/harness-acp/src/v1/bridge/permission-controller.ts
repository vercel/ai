import type { HarnessV1PermissionMode } from '@ai-sdk/harness';
import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';

type PendingPermission = {
  cancel(): void;
};

let permissionRequestCounter = 0;

export function createACPPermissionController({
  turn,
  sessionId,
  permissionMode,
  hasPermissionModeMapping,
  emitToolCall,
  claimHostToolPermission,
}: {
  turn: BridgeTurn;
  sessionId: string;
  permissionMode: HarnessV1PermissionMode;
  hasPermissionModeMapping: boolean;
  emitToolCall: (options: { toolCall: ToolCallUpdate }) => void;
  claimHostToolPermission: (options: { toolCall: ToolCallUpdate }) => boolean;
}): {
  requestPermission(
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse>;
  cancelAll(): void;
} {
  const pendingPermissions = new Map<string, PendingPermission>();

  return {
    async requestPermission(request) {
      if (request.sessionId !== sessionId) {
        turn.emitWarning({
          message:
            `ACP permission request for session ${JSON.stringify(request.sessionId)} was cancelled ` +
            `because the active session is ${JSON.stringify(sessionId)}.`,
        });
        return cancelled();
      }
      const allowOnce = request.options.find(
        option => option.kind === 'allow_once',
      );
      const rejectOnce = request.options.find(
        option => option.kind === 'reject_once',
      );
      if (allowOnce == null || rejectOnce == null) {
        const missing = [
          ...(allowOnce == null ? ['allow_once'] : []),
          ...(rejectOnce == null ? ['reject_once'] : []),
        ];
        turn.emitWarning({
          message:
            `ACP permission request for tool call ${JSON.stringify(request.toolCall.toolCallId)} ` +
            `was cancelled because it did not advertise ${missing.join(' and ')}.`,
        });
        return cancelled();
      }
      if (claimHostToolPermission({ toolCall: request.toolCall })) {
        return {
          outcome: {
            outcome: 'selected',
            optionId: allowOnce.optionId,
          },
        };
      }
      if (
        !hasPermissionModeMapping &&
        shouldAutoApprove({
          permissionMode,
          kind: request.toolCall.kind,
        })
      ) {
        return {
          outcome: {
            outcome: 'selected',
            optionId: allowOnce.optionId,
          },
        };
      }

      const approvalId = `acp-permission-${++permissionRequestCounter}`;
      let cancelPermission!: () => void;
      const cancellation = new Promise<undefined>(resolve => {
        cancelPermission = () => resolve(undefined);
      });
      pendingPermissions.set(approvalId, {
        cancel: cancelPermission,
      });
      const approval = turn.requestToolApproval(approvalId);
      emitToolCall({ toolCall: request.toolCall });
      turn.emit({
        type: 'tool-approval-request',
        approvalId,
        toolCallId: request.toolCall.toolCallId,
      });

      try {
        const response = await Promise.race([approval, cancellation]);
        if (response == null) return cancelled();
        return {
          outcome: {
            outcome: 'selected',
            optionId: response.approved
              ? allowOnce.optionId
              : rejectOnce.optionId,
          },
        };
      } finally {
        pendingPermissions.delete(approvalId);
      }
    },
    cancelAll() {
      for (const pending of pendingPermissions.values()) {
        pending.cancel();
      }
      pendingPermissions.clear();
    },
  };
}

function shouldAutoApprove({
  permissionMode,
  kind,
}: {
  permissionMode: HarnessV1PermissionMode;
  kind: ToolCallUpdate['kind'];
}): boolean {
  if (permissionMode === 'allow-all') return true;
  if (
    kind === 'read' ||
    kind === 'search' ||
    kind === 'think' ||
    kind === 'fetch'
  ) {
    return true;
  }
  return (
    permissionMode === 'allow-edits' &&
    (kind === 'edit' || kind === 'delete' || kind === 'move')
  );
}

function cancelled(): RequestPermissionResponse {
  return { outcome: { outcome: 'cancelled' } };
}
