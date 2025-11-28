'use client';

import { FormEvent, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { OpenAIImageStoryboardMessage } from '@/agent/openai-image-storyboard-agent';
import { OpenAIImageStoryboardMessages } from '@/components/openai-image-storyboard-messages';

export default function Page() {
  const [input, setInput] = useState('');

  const { messages, status, sendMessage } =
    useChat<OpenAIImageStoryboardMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-openai-image-storyboard'
      })
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  }

  return (
    <main style={{ padding: 30, maxWidth: 720, margin: 'auto', color: 'white' }}>
      <h2>🎬 OpenAI Storyboard Chat</h2>
      <p>Write a scene → AI describes + generates image</p>

      <section style={{ border: '1px solid #334', padding: 12, minHeight: 320 }}>
        <OpenAIImageStoryboardMessages messages={messages} />
      </section>

      <form onSubmit={submit} style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1, padding: 10 }}
          placeholder="Example: Cyberpunk Tehran at night..."
        />
        <button disabled={!input.trim()} style={{ padding: '10px 18px' }}>
          Send
        </button>
      </form>

      <div style={{ marginTop: 10, fontSize: 12 }}>Status: {status}</div>
    </main>
  );
}
