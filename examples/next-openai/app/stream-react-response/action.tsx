'use server';

import OpenAI from 'openai';
import { OpenAIStream, experimental_StreamingReactResponse, Message } from 'ai';
import { Counter } from './counter';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function handler({ messages }: { messages: Message[] }) {
  // Request the OpenAI API for the response based on the prompt
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages: messages.map(
      m =>
        ({
          role: m.role,
          content: m.content,
        } as any),
    ),
  });

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response);

  // Respond with the stream
  return new experimental_StreamingReactResponse(stream, {
    ui({ content }) {
      return (
        <div className="italic text-red-800">
          {content.toLowerCase().includes('next') ? (
            <p className="text-sm mb-1">
              Visit Next.js docs at{' '}
              <a
                href="https://nextjs.org/docs"
                target="_blank"
                className="underline"
              >
                https://nextjs.org/docs
              </a>
            </p>
          ) : null}
          {content.toLowerCase().includes('counter') ? (
            <p className="text-sm mb-1">
              Here's a counter component:
              <Counter />
            </p>
          ) : null}
          {content}
        </div>
      );
    },
  });
}
