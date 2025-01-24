'use client';

import { inDevelopment_useMessages as useMessages } from '@ai-sdk/react';
import { z } from 'zod';

export default function Chat() {
  const { messages } = useMessages({
    messageMetadata: z.object({
      createdAt: z.date(),
    }),
    messageDataContent: {
      person: z.object({
        name: z.string(),
        ageInYears: z.number(),
      }),
    },
    renderTextContent: content => <div>{content.text}</div>,
    renderDataContent: {
      person: content => (
        <div>
          {content.data.name}: {content.data.ageInYears} years old
        </div>
      ),
    },
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          <i>{m.metadata.createdAt.toISOString()}</i>
          {m.contentNodes}
        </div>
      ))}
    </div>
  );
}
