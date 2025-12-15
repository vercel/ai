'use client';

import { UIMessage } from 'ai';
import { GeneratedImage } from './generated-image';

interface ChatMessageProps {
  message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
          isUser
            ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white'
            : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
        }`}
      >
        {isUser ? 'U' : 'AI'}
      </div>

      {/* Message content */}
      <div
        className={`flex-1 max-w-[85%] ${isUser ? 'flex flex-col items-end' : ''}`}
      >
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-[var(--accent)] text-white rounded-tr-md'
              : 'bg-[var(--background-tertiary)] border border-[var(--border)] rounded-tl-md'
          }`}
        >
          {message.parts.map((part, i) => {
            if (part.type === 'text') {
              return (
                <div key={i} className="whitespace-pre-wrap leading-relaxed">
                  {part.text}
                </div>
              );
            }
            // Handle file parts (including generated images)
            if (part.type === 'file') {
              const filePart = part as { type: 'file'; url: string; mediaType: string };
              // Check if it's an image
              if (filePart.mediaType?.startsWith('image/')) {
                const format = filePart.mediaType.split('/')[1] || 'png';
                return (
                  <div key={i}>
                    <GeneratedImage base64={filePart.url} format={format} />
                  </div>
                );
              }
              return null;
            }
            if (part.type.startsWith('tool-')) {
              // Display tool calls (image generation comes through as 'file' parts now)
              return (
                <div
                  key={i}
                  className="mt-2 p-3 bg-[var(--background-secondary)] rounded-lg border border-[var(--border)] text-sm"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded bg-[var(--accent-light)] flex items-center justify-center">
                      🔧
                    </span>
                    <span className="font-medium text-[var(--foreground)]">
                      {'toolName' in part
                        ? String(part.toolName)
                        : part.type.replace('tool-', '')}
                    </span>
                  </div>
                  {'input' in part && (
                    <div className="text-[var(--foreground-muted)] font-mono text-xs mb-1">
                      <span className="text-[var(--foreground-secondary)]">
                        Input:{' '}
                      </span>
                      {JSON.stringify(part.input)}
                    </div>
                  )}
                  {'output' in part && part.output !== undefined && (
                    <div className="text-[var(--success)] font-mono text-xs break-all">
                      <span className="text-[var(--foreground-secondary)]">
                        Result:{' '}
                      </span>
                      {typeof part.output === 'string' && part.output.length > 200
                        ? `${part.output.slice(0, 200)}...`
                        : JSON.stringify(part.output)}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

