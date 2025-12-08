'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatInput from '@/components/chat-input';
import { useState } from 'react';

export default function TestOnStepFinishContinuation() {
  const [validationEnabled, setValidationEnabled] = useState(true);
  const [clearStepEnabled, setClearStepEnabled] = useState(true);

  const { error, status, sendMessage, messages, regenerate, stop } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat-on-step-finish-continuation',
    }),
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h1 className="mb-4 text-xl font-bold">onStepFinish Continuation Test</h1>
      <p className="mb-4 text-sm text-gray-600">
        This example demonstrates how to use onStepFinish to validate outputs
        and continue the loop with feedback when validation fails.
      </p>

      <div className="mb-6 p-4 border rounded-lg bg-gray-50 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Enable Validation
          </label>
          <button
            onClick={() => setValidationEnabled(!validationEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              validationEnabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                validationEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-gray-500">
          When enabled: Validates for no markdown and &lt; 160 chars.
          Automatically retries on failure.
        </p>

        <div className="flex items-center justify-between pt-2 border-t border-gray-200">
          <label className="text-sm font-medium text-gray-700">
            Clear Step on Retry
          </label>
          <button
            onClick={() => setClearStepEnabled(!clearStepEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              clearStepEnabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                clearStepEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-gray-500">
          When enabled: Clears the invalid step from the UI before streaming the
          retry.
          <br />
          When disabled: Appends the retry to the existing conversation without
          removing the invalid step (the invalid text remains).
        </p>
      </div>

      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap mb-4">
          <div className="font-semibold mb-1">
            {m.role === 'user' ? 'User:' : 'AI:'}
          </div>
          {m.parts.map((part, index) => {
            if (part.type === 'text') {
              return <div key={index}>{part.text}</div>;
            }
          })}
        </div>
      ))}

      {(status === 'submitted' || status === 'streaming') && (
        <div className="mt-4 text-gray-500">
          {status === 'submitted' && <div>Loading...</div>}
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <div className="text-red-500">An error occurred.</div>
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={() =>
              regenerate({
                body: {
                  validationEnabled,
                  clearStepEnabled,
                },
              })
            }
          >
            Retry
          </button>
        </div>
      )}

      <ChatInput
        status={status}
        onSubmit={text =>
          sendMessage(
            { text },
            {
              body: {
                validationEnabled,
                clearStepEnabled,
              },
            },
          )
        }
      />
    </div>
  );
}
