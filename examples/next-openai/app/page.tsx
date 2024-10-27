'use client';

import { Message, useChat } from 'ai/react';
import { ChangeEvent, FormEvent, useEffect, useRef } from 'react';

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
        interact: (data: VoiceflowMessage) => void;
      };
    };
  }
}

export default function Chat() {
  const voiceflowInitialized = useRef(false);

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
      
      try {
        // Only send to Voiceflow if it's properly initialized
        if (window.voiceflow?.chat && voiceflowInitialized.current) {
          const voiceflowMessage: VoiceflowMessage = {
            type: 'message',
            payload: {
              message: message.content,
              role: message.role,
              timestamp: new Date().toISOString()
            }
          };
          
          window.voiceflow.chat.interact(voiceflowMessage);
        }
      } catch (err) {
        console.error('Error sending message to Voiceflow:', err);
      }
    },
  });

  useEffect(() => {
    let scriptElement: HTMLScriptElement | null = null;

    const initVoiceflow = () => {
      try {
        if (window.voiceflow?.chat) {
          window.voiceflow.chat.load({
            verify: { projectID: '671e8b0eff5ef3f747ccb6cc' },
            url: 'https://general-runtime.voiceflow.com',
            versionID: 'production'
          });
          voiceflowInitialized.current = true;
          console.log('Voiceflow initialized successfully');
        } else {
          console.error('Voiceflow chat object not available');
        }
      } catch (err) {
        console.error('Error initializing Voiceflow:', err);
      }
    };

    const loadVoiceflowScript = () => {
      scriptElement = document.createElement('script');
      scriptElement.type = 'text/javascript';
      scriptElement.src = 'https://cdn.voiceflow.com/widget/bundle.mjs';
      scriptElement.async = true;
      
      scriptElement.onload = () => {
        console.log('Voiceflow script loaded');
        // Add a small delay to ensure the Voiceflow object is properly initialized
        setTimeout(initVoiceflow, 100);
      };

      scriptElement.onerror = (error) => {
        console.error('Error loading Voiceflow script:', error);
      };

      document.head.appendChild(scriptElement);
    };

    // Only load the script if it hasn't been loaded yet
    if (!document.querySelector('script[src*="voiceflow"]')) {
      loadVoiceflowScript();
    }

    return () => {
      voiceflowInitialized.current = false;
      if (scriptElement && scriptElement.parentNode) {
        scriptElement.parentNode.removeChild(scriptElement);
      }
    };
  }, []);

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
          <div className="text-red-500">
            An error occurred: {error.message || 'Unknown error'}
          </div>
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
