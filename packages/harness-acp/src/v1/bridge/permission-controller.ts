import type { HarnessV1PermissionMode } from '@ai-sdk/harness';
import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import type { HostToolCall } from './host-tool-call-resolver';
import {
  areACPToolLocationsTrusted,
  areACPToolWriteLocationsProtected,
} from './permission-locations';

type PendingPermission = {
  cancel(): void;
};

/*
 * Skills in the standardized `.agents/skills` directory are loaded into later
 * sessions, so agent writes there always require approval outside `allow-all`,
 * regardless of the adapter's own write-protected paths.
 */
const ACP_BUILTIN_WRITE_PROTECTED_PATHS = ['.agents/skills'] as const;

let permissionRequestCounter = 0;

export function createACPPermissionController({
  turn,
  sessionId,
  workDir,
  permissionMode,
  hasPermissionModeMapping,
  writeProtectedPaths,
  emitToolCall,
  claimHostToolPermission,
  onHostToolPermissionAllowed,
}: {
  turn: BridgeTurn;
  sessionId: string;
  workDir: string;
  permissionMode: HarnessV1PermissionMode;
  hasPermissionModeMapping: boolean;
  writeProtectedPaths?: ReadonlyArray<string>;
  emitToolCall: (options: { toolCall: ToolCallUpdate }) => void;
  claimHostToolPermission: (options: {
    toolCall: ToolCallUpdate;
  }) => Promise<HostToolCall | undefined>;
  onHostToolPermissionAllowed?: (options: {
    toolCallId: string;
    call: HostToolCall;
  }) => void;
}): {
  requestPermission(
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse>;
  cancelAll(): void;
} {
  const pendingPermissions = new Map<string, PendingPermission>();
  let cancellationGeneration = 0;
  const effectiveWriteProtectedPaths = [
    ...ACP_BUILTIN_WRITE_PROTECTED_PATHS,
    ...(writeProtectedPaths ?? []),
  ];

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
      const generation = cancellationGeneration;
      const call = await claimHostToolPermission({
        toolCall: request.toolCall,
      });
      if (generation !== cancellationGeneration) return cancelled();
      if (call != null) {
        onHostToolPermissionAllowed?.({
          toolCallId: request.toolCall.toolCallId,
          call,
        });
        return {
          outcome: {
            outcome: 'selected',
            optionId: allowOnce.optionId,
          },
        };
      }
      const autoApprove =
        !hasPermissionModeMapping &&
        shouldAutoApprove({
          permissionMode,
          kind: request.toolCall.kind,
        }) &&
        (permissionMode === 'allow-all' ||
          ((await areACPToolLocationsTrusted({
            toolCall: request.toolCall,
            workDir,
          })) &&
            !(
              isWriteKind({ kind: request.toolCall.kind }) &&
              (await areACPToolWriteLocationsProtected({
                toolCall: request.toolCall,
                workDir,
                writeProtectedPaths: effectiveWriteProtectedPaths,
              }))
            )));
      if (generation !== cancellationGeneration) return cancelled();
      if (autoApprove) {
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
      turn.emit({
        type: 'finish-step',
        finishReason: { unified: 'tool-calls', raw: 'host-input' },
        usage: unknownUsage(),
        harnessMetadata: { acp: { inferredStep: true } },
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
      cancellationGeneration += 1;
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

function isWriteKind({ kind }: { kind: ToolCallUpdate['kind'] }): boolean {
  return kind === 'edit' || kind === 'delete' || kind === 'move';
}

function cancelled(): RequestPermissionResponse {
  return { outcome: { outcome: 'cancelled' } };
}

function unknownUsage() {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
  };
}
