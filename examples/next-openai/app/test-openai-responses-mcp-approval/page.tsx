'use client';

import ChatInput from '@/components/chat-input';
import DynamicToolView from '@/components/tool/dynamic-tool-view';
import OpenAIMCPApprovalView from '@/components/tool/openai-mcp-approval-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage, isToolUIPart } from 'ai';
import { OpenAIResponsesMCPApprovalMessage } from '../api/chat-openai-responses-mcp-approval/route';

// Custom helper that handles provider-executed tools (like OpenAI MCP)
function lastAssistantMessageIsCompleteWithProviderExecutedApprovalResponses({
  messages,
}: {
  messages: UIMessage[];
}): boolean {
  const message = messages[messages.length - 1];

  if (!message || message.role !== 'assistant') {
    return false;
  }

  const lastStepStartIndex = message.parts.reduce((lastIndex, part, index) => {
    return part.type === 'step-start' ? index : lastIndex;
  }, -1);

  // Include provider-executed tools (unlike the default helper)
  const lastStepToolInvocations = message.parts
    .slice(lastStepStartIndex + 1)
    .filter(isToolUIPart);

  return (
    // has at least one tool approval response
    lastStepToolInvocations.filter(part => part.state === 'approval-responded')
      .length > 0 &&
    // all tool approvals must have a response
    lastStepToolInvocations.every(
      part =>
        part.state === 'output-available' ||
        part.state === 'output-error' ||
        part.state === 'approval-responded',
    )
  );
}

export default function TestOpenAIResponsesMCPApproval() {
  const { status, sendMessage, messages, addToolApprovalResponse } =
    useChat<OpenAIResponsesMCPApprovalMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-openai-responses-mcp-approval',
      }),
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithProviderExecutedApprovalResponses,
    });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">
        OpenAI Responses MCP Tool Approval Test
      </h1>
      <p className="mb-4 text-sm text-gray-600">
        Try asking: &quot;Shorten the link https://ai-sdk.dev/&quot;
      </p>

      {messages.map(message => (
        <div key={message.id} className="mb-4 whitespace-pre-wrap">
          <div className="mb-2 font-semibold">
            {message.role === 'user' ? 'User' : 'AI'}:
          </div>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return (
                  <div key={index} className="mb-2">
                    {part.text}
                  </div>
                );
              case 'dynamic-tool':
                // MCP tools from OpenAI are dynamic tools - check if it's an MCP tool
                // by looking at the toolName (starts with 'mcp.')
                if (
                  part.toolName.startsWith('mcp.') ||
                  part.toolName === 'mcp'
                ) {
                  return (
                    <div key={index} className="mb-4">
                      <OpenAIMCPApprovalView
                        invocation={part}
                        addToolApprovalResponse={addToolApprovalResponse}
                      />
                    </div>
                  );
                }
                return (
                  <div key={index} className="mb-4">
                    <DynamicToolView invocation={part} />
                  </div>
                );
              case 'step-start':
                return index > 0 ? (
                  <div key={index} className="my-2 border-t border-gray-300" />
                ) : null;
            }
          })}
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
