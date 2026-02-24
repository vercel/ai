'use client';

import type { OpenAIImageStoryboardMessage } from '@/agent/openai-image-storyboard-agent';
import OpenAIImageGenerationView from '@/components/openai-image-generation-view';

interface Props {
  messages: OpenAIImageStoryboardMessage[];
}

export function OpenAIImageStoryboardMessages({ messages }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {messages.map((message) => (
        <div
          key={message.id}
          style={{
            alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '75%',
            padding: 12,
            borderRadius: 12,
            background:
              message.role === 'user'
                ? 'rgba(59,130,246,0.1)'
                : 'rgba(15,23,42,0.9)',
            color: message.role === 'user' ? '#0f172a' : '#e5e7eb',
            fontSize: 14
          }}
        >
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return (
                  <p key={index} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {part.text}
                  </p>
                );
              case 'tool-image_generation':
                return (
                  <div key={index} style={{ marginTop: 8 }}>
                    <OpenAIImageGenerationView invocation={part} />
                  </div>
                );
              default:
                return null;
            }
          })}
        </div>
      ))}
    </div>
  );
}
