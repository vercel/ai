'use client';

import { useRealtime } from '@ai-sdk/react';
import { openai } from '@ai-sdk/openai';
import { useState } from 'react';

export default function RealtimePage() {
  const {
    messages,
    addToolOutput,
    status,
    connect,
    disconnect,
    sendTextMessage,
    startAudioCapture,
    stopAudioCapture,
    isCapturing,
    isPlaying,
    stopPlayback,
  } = useRealtime({
    model: openai.realtime('gpt-4o-realtime-preview'),
    api: {
      token: '/api/realtime/setup',
      tools: '/api/realtime/execute-tools',
    },
    async onToolCall({ toolCall }) {
      // Example: handle a client-side tool
      if (toolCall.toolName === 'setTheme') {
        document.documentElement.classList.toggle('dark');
        return { success: true };
      }
    },
  });

  const [text, setText] = useState('');

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="text-xl font-bold mb-4">Realtime Chat</h1>

      {/* Connection controls */}
      <div className="flex gap-2 mb-4">
        {status === 'disconnected' || status === 'error' ? (
          <button
            className="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
            onClick={() => connect()}
          >
            Connect
          </button>
        ) : (
          <button
            className="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700"
            onClick={() => disconnect()}
          >
            Disconnect
          </button>
        )}

        {status === 'connected' && (
          <>
            <button
              className={`px-4 py-2 font-bold text-white rounded ${
                isCapturing
                  ? 'bg-red-500 hover:bg-red-700'
                  : 'bg-green-500 hover:bg-green-700'
              }`}
              onClick={async () => {
                if (isCapturing) {
                  stopAudioCapture();
                } else {
                  const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                  });
                  startAudioCapture(stream);
                }
              }}
            >
              {isCapturing ? 'Stop Mic' : 'Start Mic'}
            </button>

            {isPlaying && (
              <button
                className="px-4 py-2 font-bold text-white bg-yellow-500 rounded hover:bg-yellow-700"
                onClick={() => stopPlayback()}
              >
                Stop Playback
              </button>
            )}
          </>
        )}
      </div>

      <div className="text-sm text-gray-500 mb-4">Status: {status}</div>

      {/* Messages */}
      {messages?.map(message => (
        <div key={message.id} className="whitespace-pre-wrap mb-2">
          <strong>{`${message.role}: `}</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return (
                  <span key={index}>
                    {part.text}
                    {part.state === 'streaming' && (
                      <span className="animate-pulse">...</span>
                    )}
                  </span>
                );

              case 'dynamic-tool':
                return (
                  <div key={index} className="text-gray-500 text-sm ml-2">
                    {part.state === 'input-streaming' && (
                      <span>Calling {part.toolName || 'tool'}...</span>
                    )}
                    {part.state === 'input-available' && (
                      <span>
                        Running {part.toolName}({JSON.stringify(part.input)})...
                      </span>
                    )}
                    {part.state === 'output-available' && (
                      <span>
                        {part.toolName}: {JSON.stringify(part.output)}
                      </span>
                    )}
                  </div>
                );

              default:
                return null;
            }
          })}
        </div>
      ))}

      {/* Text input */}
      {status === 'connected' && (
        <form
          className="fixed bottom-0 w-full max-w-md mb-8"
          onSubmit={e => {
            e.preventDefault();
            if (text.trim() === '') return;
            sendTextMessage(text);
            setText('');
          }}
        >
          <input
            className="w-full p-2 border border-gray-300 rounded shadow-xl"
            placeholder="Type a message..."
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </form>
      )}
    </div>
  );
}
