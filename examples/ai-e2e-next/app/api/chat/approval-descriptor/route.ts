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
    execute: ({ writer }) => {
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
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish' });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
