'use client';

import { createOpenAI } from '@ai-sdk/openai';
import { inDevelopment_useConversation as useConversation } from '@ai-sdk/react';
import { createAsyncIterableStream, streamText } from 'ai';
import { useRef } from 'react';
import { z } from 'zod';

const openai = createOpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
});

export default function Chat() {
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, submitMessage } = useConversation({
    api: {
      send: function ({ messages }) {
        const { textStream } = streamText({
          model: openai('gpt-4o'),
          messages: messages.map(m => ({
            role: m.role,
            content: m.content.map(c => ({ type: 'text', text: c.text })),
          })),
        });

        return createAsyncIterableStream(
          textStream.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                controller.enqueue({ type: 'text-delta', delta: chunk });
              },
            }),
          ),
        );
      },
    },
    messageMetadata: z.object({
      createdAt: z.date(),
    }),
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto bg-white stretch dark:bg-gray-900">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap dark:text-white">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content.map(c => (
            <div key={c.type}>{c.text}</div>
          ))}
        </div>
      ))}

      <form
        onSubmit={e => {
          e.preventDefault();
          const input = inputRef.current;
          if (!input) return;

          submitMessage({
            text: input.value,
            metadata: { createdAt: new Date() },
          });

          input.value = '';
        }}
      >
        <input
          ref={inputRef}
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400"
          placeholder="Say something..."
        />
      </form>
    </div>
  );
}
