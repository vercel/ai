'use client';

import { useChat } from '@ai-sdk/react';
import { LangSmithDeploymentTransport } from '@ai-sdk/langchain';
import { useState, useMemo } from 'react';

// Default to local LangGraph dev server
const LOCAL_DEV_URL = 'http://localhost:2024';

export default function LangSmithPage() {
  const [customUrl, setCustomUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  // Determine the deployment URL
  const deploymentUrl = customUrl || LOCAL_DEV_URL;

  // Create transport for local dev or custom deployment
  const transport = useMemo(() => {
    return new LangSmithDeploymentTransport({
      url: deploymentUrl,
      apiKey: apiKey || undefined,
    });
  }, [deploymentUrl, apiKey]);

  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h4 className="pb-2 text-xl font-bold text-gray-900">
        LangGraph Transport Example
      </h4>
      <p className="pb-4 text-sm text-gray-600">
        Using{' '}
        <code className="bg-gray-100 px-1 rounded">
          LangSmithDeploymentTransport
        </code>{' '}
        to communicate directly from the browser.
      </p>

      {/* Deployment config */}
      <div className="p-3 mb-4 bg-blue-50 border border-blue-200 rounded text-sm">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium text-blue-800">
              🚀 Connected to:{' '}
            </span>
            <code className="text-blue-700 text-xs">{deploymentUrl}</code>
          </div>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showConfig ? 'Hide' : 'Configure'}
          </button>
        </div>

        {showConfig && (
          <div className="mt-3 pt-3 border-t border-blue-200 space-y-2">
            <input
              type="url"
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              placeholder={`Custom URL (default: ${LOCAL_DEV_URL})`}
              className="w-full p-2 text-xs border border-blue-300 rounded"
            />
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="API Key (required for LangSmith deployments)"
              className="w-full p-2 text-xs border border-blue-300 rounded"
            />
            <p className="text-xs text-blue-600">
              The local server starts automatically with{' '}
              <code className="bg-blue-100 px-1 rounded">pnpm dev</code>
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 mb-4 text-white bg-red-500 rounded">
          {error.message}
        </div>
      )}

      <div className="flex-1 overflow-y-auto mb-20">
        {messages.map(m => (
          <div key={m.id} className="whitespace-pre-wrap mb-4">
            <div className="font-bold">
              {m.role === 'user' ? 'You: ' : 'Assistant: '}
            </div>
            {m.parts.map((part, i) => {
              if (part.type === 'text') {
                return <div key={i}>{part.text}</div>;
              }
              if (part.type.startsWith('tool-')) {
                return (
                  <div
                    key={i}
                    className="p-2 my-2 bg-gray-100 rounded text-sm"
                  >
                    <div className="font-semibold">🔧 Tool: {part.type}</div>
                    {'input' in part && (
                      <div className="text-gray-600">
                        Input: {JSON.stringify(part.input)}
                      </div>
                    )}
                    {'output' in part && part.output !== undefined && (
                      <div className="text-green-600">
                        Result: {JSON.stringify(part.output)}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {status === 'streaming' && (
          <div className="text-gray-500 animate-pulse">Thinking...</div>
        )}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
      >
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Send a message..."
          onChange={e => setInput(e.target.value)}
          disabled={status === 'streaming'}
        />
      </form>
    </div>
  );
}

