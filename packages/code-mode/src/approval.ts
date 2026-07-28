import { CodeModeProtocolError } from './errors.js';
import type {
  CodeModeApprovalInterruptPayload,
  CodeModeApprovalResolution,
  CodeModeApprovalResponse,
  CodeModeInterruptPayload,
} from './types.js';

/**
 * Reserved interruption payload kind for built-in nested tool approvals.
 *
 * Approval is implemented as a generic code-mode interruption tagged with this
 * kind. Host tools must not use this kind for their own
 * `requestCodeModeInterrupt` payloads.
 *
 * @internal
 */
export const CODE_MODE_TOOL_APPROVAL_KIND = 'ai-sdk-code-mode/tool-approval';

/**
 * Returns true when a generic interruption payload is a built-in approval.
 *
 * @internal
 */
export function isCodeModeApprovalInterruptPayload(
  payload: CodeModeInterruptPayload,
): payload is CodeModeApprovalInterruptPayload {
  return payload.kind === CODE_MODE_TOOL_APPROVAL_KIND;
}

/**
 * Validates an approval response from model/client history at runtime.
 *
 * @internal
 */
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

/**
 * Validates and normalizes the resolution used to resume an approval
 * interruption. The generic interrupt machinery passes this resolution through
 * `continueCodeModeInterrupt`; approval interrupts require a boolean decision.
 *
 * @internal
 */
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

  const approved = (resolution as { approved: boolean }).approved;
  const reason = (resolution as { reason?: string }).reason;
  return {
    approved,
    ...(reason !== undefined ? { reason } : {}),
  };
}
