'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';

function formatDescriptor(descriptor: unknown) {
  return JSON.stringify(descriptor, null, 2);
}

export default function ApprovalDescriptor() {
  const { error, messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat/approval-descriptor',
    }),
  });

  const toolPart = messages
    .flatMap(message => message.parts)
    .findLast(isToolUIPart);

  const approval =
    toolPart?.state === 'approval-requested' ||
    toolPart?.state === 'approval-responded'
      ? toolPart.approval
      : undefined;

  return (
    <main className="flex flex-col gap-6 py-24 mx-auto w-full max-w-xl">
      <div>
        <h1 className="text-xl font-bold">Approval Descriptor Stream</h1>
        <p className="mt-2 text-sm text-gray-600">
          Streams an approval request and response from a remote agent. The
          descriptor should remain unchanged in both UI states.
        </p>
      </div>

      <button
        type="button"
        data-testid="start-approval-stream"
        className="self-start px-4 py-2 text-white bg-blue-500 rounded disabled:opacity-50"
        disabled={status !== 'ready'}
        onClick={() =>
          sendMessage({ text: 'Request the account deletion approval.' })
        }
      >
        {status === 'ready' ? 'Start stream' : 'Streaming…'}
      </button>

      {toolPart != null && (
        <section className="p-4 border rounded">
          <div>
            Tool state:{' '}
            <strong data-testid="approval-state">{toolPart.state}</strong>
          </div>

          {approval != null && (
            <>
              <div className="mt-3">Approval descriptor:</div>
              <pre
                data-testid="approval-descriptor"
                className="p-3 mt-1 overflow-auto text-sm bg-gray-100 rounded"
              >
                {formatDescriptor(approval.descriptor)}
              </pre>
            </>
          )}
        </section>
      )}

      {error != null && (
        <div data-testid="approval-error" className="text-red-600">
          {error.message}
        </div>
      )}
    </main>
  );
}
