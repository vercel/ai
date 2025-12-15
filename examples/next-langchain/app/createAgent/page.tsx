'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ChatContainer } from '../../components/chat-container';

const transport = new DefaultChatTransport({
  api: '/api/createAgent',
});

export default function AgentPage() {
  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  return (
    <ChatContainer
      title="Image Generation Agent"
      description={
        <>
          Uses LangChain&apos;s <code>createAgent</code> with the{' '}
          <code>imageGeneration</code> tool to showcase multimodality. Ask the
          AI to draw, create, or design any image you can imagine!
        </>
      }
      messages={messages}
      onSend={text => sendMessage({ text })}
      status={status}
      error={error}
      placeholder="Draw a cozy cabin in the mountains at sunset..."
      suggestions={[
        'Draw a cat wearing a top hat',
        'Create a futuristic city skyline',
        'Design a logo for a coffee shop',
      ]}
    />
  );
}
