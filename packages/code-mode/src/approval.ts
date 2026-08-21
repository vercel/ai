import { CodeModeProtocolError } from './errors.js';
import type {
  CodeModeApprovalInterruptPayload,
  CodeModeApprovalResolution,
  CodeModeApprovalResponse,
  CodeModeInterruptPayload,
} from './types.js';

export const CODE_MODE_TOOL_APPROVAL_KIND =
  'ai-sdk-code-mode/tool-approval' as const;

export function isCodeModeApprovalInterruptPayload(
  payload: CodeModeInterruptPayload,
): payload is CodeModeApprovalInterruptPayload {
  return payload.kind === CODE_MODE_TOOL_APPROVAL_KIND;
}

export function assertCodeModeApprovalResponse(
  value: unknown,
): asserts value is CodeModeApprovalResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as { approvalId?: unknown }).approvalId !== 'string' ||
    typeof (value as { approved?: unknown }).approved !== 'boolean' ||
    ('reason' in value &&
      (value as { reason?: unknown }).reason !== undefined &&
      typeof (value as { reason?: unknown }).reason !== 'string')
  ) {
    throw new CodeModeProtocolError(
      'Code mode approval response is malformed.',
    );
  }
}

export function normalizeApprovalResolution(
  resolution: unknown,
): CodeModeApprovalResolution {
  if (
    typeof resolution !== 'object' ||
    resolution === null ||
    Array.isArray(resolution) ||
    typeof (resolution as { approved?: unknown }).approved !== 'boolean' ||
    ('reason' in resolution &&
      (resolution as { reason?: unknown }).reason !== undefined &&
      typeof (resolution as { reason?: unknown }).reason !== 'string')
  ) {
    throw new CodeModeProtocolError(
      'Code mode approval resolution must be a boolean approval decision.',
      { resolution },
    );
  }

  const { approved, reason } = resolution as CodeModeApprovalResolution;
  return {
    approved,
    ...(reason !== undefined ? { reason } : {}),
  };
}
