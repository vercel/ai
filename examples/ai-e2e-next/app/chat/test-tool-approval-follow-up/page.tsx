'use client';

import type { OpenAIWeatherToolApprovalAgentUIMessage } from '@/agent/openai/weather-tool-approval-agent';
import WeatherWithApprovalView from '@/components/tool/weather-with-approval-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function TestToolApprovalFollowUp() {
  // Leave automatic continuation disabled to record approval without execution.
  const { status, error, messages, sendMessage, addToolApprovalResponse } =
    useChat<OpenAIWeatherToolApprovalAgentUIMessage>({
      transport: new DefaultChatTransport({ api: '/api/chat/tool-approval' }),
    });

  const hasUnresolvedApproval = messages.some(message =>
    message.parts.some(
      part =>
        part.type === 'tool-weather' &&
        part.state === 'approval-responded' &&
        part.approval.approved,
    ),
  );

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">Tool Approval Follow-up Test</h1>
      <p className="mb-4">
        Request the weather, wait for the response to finish, and approve the
        tool. Then send a new message while the approved tool has no result.
        Reload the page to try resuming the tool as a control.
      </p>
      <div className="mb-4">Status: {status}</div>

      {messages.map(message => (
        <div key={message.id} className="mb-4 whitespace-pre-wrap">
          <strong>{message.role === 'user' ? 'User: ' : 'AI: '}</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <div key={index}>{part.text}</div>;
              case 'tool-weather':
                return (
                  <WeatherWithApprovalView
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
        <div role="alert" className="mb-4 text-red-500">
          {error.message}
        </div>
      )}

      <button
        type="button"
        className="p-2 mb-4 border rounded"
        disabled={status !== 'ready' || messages.length > 0}
        onClick={() =>
          sendMessage({
            text: 'Use the weather tool to get the weather in London.',
          })
        }
      >
        Request weather in London
      </button>
      <button
        type="button"
        className="p-2 mb-4 border rounded"
        disabled={status !== 'ready' || !hasUnresolvedApproval}
        onClick={() =>
          sendMessage({ text: 'Reply with OK without calling any tools.' })
        }
      >
        Send a new message before execution
      </button>
      <button
        type="button"
        className="p-2 border rounded"
        disabled={status !== 'ready' || !hasUnresolvedApproval}
        onClick={() => sendMessage()}
      >
        Resume approved tool without a new message
      </button>
    </div>
  );
}
