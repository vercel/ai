'use client';

import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  isToolOrDynamicToolUIPart,
  getToolOrDynamicToolName,
  type DynamicToolUIPart,
  type ToolUIPart,
} from 'ai';
import { useEffect, useRef } from 'react';

export default function McpToolTitleExample() {
  const inputRef = useRef<HTMLInputElement>(null);

  const { error, status, sendMessage, messages, regenerate, stop } = useChat({
    transport: new DefaultChatTransport({ api: '/api/mcp-tool-title' }),
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col w-full max-w-2xl py-24 mx-auto stretch">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">MCP Tool Title Example</h1>
        <p className="text-sm text-gray-600">
          This example demonstrates MCP tool titles. Tool titles provide
          human-readable names for better UX.
        </p>
      </div>

      {messages.map(m => (
        <div key={m.id} className="mb-4">
          <div className="font-semibold mb-2">
            {m.role === 'user' ? '👤 User' : '🤖 Assistant'}
          </div>
          <div className="pl-4 space-y-2">
            {m.parts.map((part, index) => {
              // Handle text parts
              if (part.type === 'text') {
                return (
                  <div key={index} className="whitespace-pre-wrap">
                    {part.text}
                  </div>
                );
              }

              if (part.type === 'step-start') {
                return index > 0 ? (
                  <div key={index} className="my-4">
                    <hr className="border-gray-300" />
                  </div>
                ) : null;
              }

              if (isToolOrDynamicToolUIPart(part)) {
                const toolPart = part as ToolUIPart<any> | DynamicToolUIPart;
                const toolName = getToolOrDynamicToolName(toolPart);

                // Display tool title if available, fallback to tool name
                const displayName = toolPart.title || toolName;

                return (
                  <div
                    key={index}
                    className="p-4 border border-gray-300 rounded-lg bg-gray-50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🔧</span>
                      <div>
                        <div className="font-semibold text-sm">
                          {displayName}
                        </div>
                        {toolPart.title && (
                          <div className="text-xs text-gray-500">
                            Tool ID: {toolName}
                          </div>
                        )}
                      </div>
                    </div>

                    {toolPart.state === 'input-streaming' && (
                      <div className="text-sm text-gray-600">
                        <div className="mb-1">Streaming input...</div>
                        {toolPart.input && (
                          <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
                            {JSON.stringify(toolPart.input, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}

                    {toolPart.state === 'input-available' && (
                      <div className="text-sm text-gray-600">
                        <div className="mb-1">Input:</div>
                        <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
                          {JSON.stringify(toolPart.input, null, 2)}
                        </pre>
                      </div>
                    )}

                    {toolPart.state === 'output-available' && (
                      <div className="text-sm">
                        <div className="mb-1 text-gray-600">Output:</div>
                        <div className="bg-white p-2 rounded text-xs">
                          {typeof toolPart.output === 'string'
                            ? toolPart.output
                            : JSON.stringify(toolPart.output, null, 2)}
                        </div>
                      </div>
                    )}

                    {toolPart.state === 'output-error' && (
                      <div className="text-sm text-red-600">
                        Error: {toolPart.errorText}
                      </div>
                    )}
                  </div>
                );
              }

              return null;
            })}
          </div>
        </div>
      ))}

      {(status === 'submitted' || status === 'streaming') && (
        <div className="mt-4 text-gray-500 text-sm">
          {status === 'submitted' && <div>Loading...</div>}
          <button
            type="button"
            className="px-4 py-2 mt-4 text-sm text-blue-500 border border-blue-500 rounded-md hover:bg-blue-50"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <div className="text-red-500 text-sm">An error occurred.</div>
          <button
            type="button"
            className="px-4 py-2 mt-4 text-sm text-blue-500 border border-blue-500 rounded-md hover:bg-blue-50"
            onClick={() => regenerate()}
          >
            Retry
          </button>
        </div>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          const value = inputRef.current?.value;
          if (value) {
            sendMessage({ text: value });
            inputRef.current!.value = '';
          }
        }}
        className="fixed bottom-0 w-full max-w-2xl p-4 bg-white border-t"
      >
        <input
          ref={inputRef}
          disabled={status !== 'ready'}
          className="w-full p-2 border border-gray-300 rounded shadow-sm"
          placeholder="Try: 'What's the weather in Paris?' or 'Calculate 25 + 37'"
        />
      </form>
    </div>
  );
}
