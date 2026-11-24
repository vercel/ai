'use client';

import {
  isToolUIPart,
  type ChatAddToolApproveResponseFunction,
  type UIMessage,
} from 'ai';

/**
 * Approve and deny buttons for a tool call that waits for the user's
 * approval. Renders nothing for any other part.
 *
 * A response only updates the chat's messages. The chat sends them once
 * every pending approval of the step has a response, which continues the
 * turn.
 */
export default function ToolApprovalControls({
  part,
  addToolApprovalResponse,
}: {
  part: UIMessage['parts'][number];
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}) {
  if (!isToolUIPart(part) || part.state !== 'approval-requested') {
    return null;
  }
  const approvalId = part.approval.id;

  return (
    <div className="flex gap-2 mb-2 ml-4">
      <button
        type="button"
        className="px-2 py-1 text-xs text-white bg-green-600 rounded"
        data-approval-id={approvalId}
        data-approval-response="approve"
        onClick={() =>
          void addToolApprovalResponse({ id: approvalId, approved: true })
        }
      >
        Approve
      </button>
      <button
        type="button"
        className="px-2 py-1 text-xs text-white bg-red-600 rounded"
        data-approval-id={approvalId}
        data-approval-response="deny"
        onClick={() =>
          void addToolApprovalResponse({
            id: approvalId,
            approved: false,
            reason: 'The user denied the tool call.',
          })
        }
      >
        Deny
      </button>
    </div>
  );
}
