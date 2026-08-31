import { delay } from '@ai-sdk/provider-utils';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';

const approvalDescriptor = {
  action: 'delete-account',
  options: {
    remember: true,
  },
  risk: 'high',
};

export async function POST() {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'start-step' });
      writer.write({
        type: 'tool-input-available',
        toolCallId: 'delete-account-call',
        toolName: 'deleteAccount',
        input: { userId: 'user-123' },
        dynamic: true,
      });
      writer.write({
        type: 'tool-approval-request',
        approvalId: 'delete-account-approval',
        toolCallId: 'delete-account-call',
        approvalDescriptor,
      });

      // Keep the request visible long enough to verify both UI states manually.
      await delay(1500);

      writer.write({
        type: 'tool-approval-response',
        approvalId: 'delete-account-approval',
        approved: true,
        reason: 'Approved by the remote agent',
      });
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish' });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
