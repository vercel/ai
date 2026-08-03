'use client';

import type { CodeModeToolApprovalMessage } from '@/agent/code-mode/code-mode-tool-approval-agent';
import { Response } from '@/components/ai-elements/response';
import ChatInput from '@/components/chat-input';
import CodeModeToolApprovalView from '@/components/tool/code-mode-tool-approval-view';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai';

const transport = new DefaultChatTransport({
  api: '/api/chat/code-mode-tool-approval',
});

export default function ChatCodeModeToolApproval() {
  const {
    error,
    status,
    sendMessage,
    messages,
    regenerate,
    addToolApprovalResponse,
  } = useChat<CodeModeToolApprovalMessage>({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-xl stretch">
      <h1 className="mb-4 text-xl font-bold">Code Mode with Tool Approvals</h1>
      <p className="mb-4 text-sm text-gray-600">
        The agent writes sandboxed TypeScript to coordinate tools. You approve
        the generated code and each nested tool call before it executes.
      </p>
      <p className="mb-6 text-sm text-gray-500">
        Try: &quot;Buy 2 units of product sku_123.&quot;
      </p>

      {messages.map(message => (
        <div key={message.id} className="mb-4 whitespace-pre-wrap">
          <strong>{message.role === 'user' ? 'User: ' : 'AI: '}</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <Response key={index}>{part.text}</Response>;
              case 'tool-codeMode':
              case 'tool-getProductPrice':
              case 'tool-purchaseProduct':
                return (
                  <CodeModeToolApprovalView
                    key={index}
                    invocation={part}
                    addToolApprovalResponse={addToolApprovalResponse}
                  />
                );
            }
          })}
        </div>
      ))}

      {error && (
        <div className="mb-4">
          <div className="text-red-600">An error occurred: {error.message}</div>
          <button
            type="button"
            className="px-4 py-2 mt-3 text-blue-600 rounded-md border border-blue-600"
            onClick={() => regenerate()}
          >
            Retry
          </button>
        </div>
      )}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
