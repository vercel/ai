'use client';

import { Message, useChat } from 'ai/react';
import { ChangeEvent, FormEvent, useEffect } from 'react';

interface VoiceflowMessage {
  type: string;
  payload: {
    message: string;
    role: string;
    timestamp: string;
  };
}

interface VoiceflowConfig {
  verify: {
    projectID: string;
  };
  url: string;
  versionID: string;
}

declare global {
  interface Window {
    voiceflow?: {
      chat: {
        load: (config: VoiceflowConfig) => void;
        interact: (data: any) => void;
      };
    };
  }
}

export default function Chat() {
  const {
    error,
    input,
    isLoading,
    handleInputChange,
    handleSubmit,
    messages,
    reload,
    stop,
  } = useChat({
    keepLastMessageOnError: true,
    onFinish(message: Message, { usage, finishReason }) {
      console.log('Usage:', usage);
      console.log('FinishReason:', finishReason);
      
      // Trigger dynamic binding event when chat message is finished
      if (window.voiceflow?.chat) {
        window.voiceflow.chat.interact({
          type: 'message',
          payload: {
            message: message.content,
            role: message.role,
            timestamp: new Date().toISOString()
          }
        });
      }
    },
  });

  useEffect(() => {
    // Create and inject the Voiceflow script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://cdn.voiceflow.com/widget/bundle.mjs';
    script.onload = () => {
      // Initialize Voiceflow chat widget with dynamic binding
      if (window.voiceflow?.chat) {
        window.voiceflow.chat.load({
          verify: { projectID: '671e8b0eff5ef3f747ccb6cc' },
          url: 'https://general-runtime.voiceflow.com',
          versionID: 'production'
        });
      }
    };

    // Find the first script tag to insert before
    const firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode?.insertBefore(script, firstScript);

    return () => {
      // Cleanup script when component unmounts
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    handleSubmit(e);
  };

  const handleInputValueChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleInputChange(e);
  };

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map((m: Message) => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}

      {isLoading && (
        <div className="mt-4 text-gray-500">
          <div>Loading...</div>
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
            onClick={() => reload()}
          >
            Retry
          </button>
        </div>
      )}

      <form onSubmit={handleFormSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputValueChange}
          disabled={isLoading || error != null}
        />
      </form>
    </div>
  );
}
