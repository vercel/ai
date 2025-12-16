'use client';

import { UIMessage, ChatStatus } from 'ai';
import { useEffect, useRef } from 'react';
import { AlertCircle, MessageCircle, Sparkles } from 'lucide-react';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';

interface ChatContainerProps {
  messages: UIMessage[];
  onSend: (message: string) => void;
  status: ChatStatus;
  error?: Error | undefined;
  placeholder?: string;
  title: string;
  description?: React.ReactNode;
  configPanel?: React.ReactNode;
  suggestions?: string[];
}

export function ChatContainer({
  messages,
  onSend,
  status,
  error,
  placeholder,
  title,
  description,
  configPanel,
  suggestions,
}: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-[var(--border)] rounded-t-xl">
        <h1 className="text-2xl font-semibold text-[var(--foreground)] mb-2">
          {title}
        </h1>
        {description && (
          <div className="text-sm text-[var(--foreground-secondary)] leading-relaxed">
            {description}
          </div>
        )}
        {configPanel && <div className="mt-4">{configPanel}</div>}
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" strokeWidth={2} />
            {error.message}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-amber-600/20 to-yellow-500/20 flex items-center justify-center">
              <MessageCircle
                className="w-8 h-8 text-amber-400"
                strokeWidth={1.5}
              />
            </div>
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">
              Start a conversation
            </h3>
            <p className="text-sm text-[var(--foreground-secondary)] max-w-xs mb-6">
              Send a message to begin chatting with the AI assistant.
            </p>

            {/* Suggestion chips */}
            {suggestions && suggestions.length > 0 && (
              <div className="flex flex-col gap-2 w-full max-w-md">
                <div className="flex items-center justify-center gap-2 text-xs text-[var(--foreground-secondary)] mb-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Try an example</span>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => onSend(suggestion)}
                      className="px-4 py-2.5 text-sm bg-[var(--background-tertiary)] border border-[var(--border-hover)] rounded-full text-[var(--foreground)] hover:border-[var(--accent)] hover:bg-[var(--accent-light)] transition-all"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map(message => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {(status === 'submitted' || status === 'streaming') && (
              <div className="flex items-center gap-2 text-[var(--foreground-muted)]">
                <div className="flex gap-1">
                  <span
                    className="w-2 h-2 bg-[var(--accent)] rounded-full"
                    style={{ animation: 'typing 1s infinite 0s' }}
                  />
                  <span
                    className="w-2 h-2 bg-[var(--accent)] rounded-full"
                    style={{ animation: 'typing 1s infinite 0.2s' }}
                  />
                  <span
                    className="w-2 h-2 bg-[var(--accent)] rounded-full"
                    style={{ animation: 'typing 1s infinite 0.4s' }}
                  />
                </div>
                <span className="text-sm">AI is thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSend}
        disabled={status === 'submitted' || status === 'streaming'}
        placeholder={placeholder}
      />
    </div>
  );
}
