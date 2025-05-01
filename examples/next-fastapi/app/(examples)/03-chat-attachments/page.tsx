'use client';

import { Card } from '@/app/components';
/* eslint-disable @next/next/no-img-element */
import { useChat } from '@ai-sdk/react';
import { useRef, useState } from 'react';

export default function Page() {
  const { messages, input, handleSubmit, handleInputChange, status } = useChat({
    streamProtocol: 'data',
  });

  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 p-4">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="flex-shrink-0 w-24 text-zinc-500">{`${message.role}: `}</div>
            <div className="flex flex-col gap-2">
              {message.parts.map((part, index) => {
                if (part.type === 'text') {
                  return <div key={index}>{part.text}</div>;
                }
                if (
                  part.type === 'file' &&
                  part.mediaType?.startsWith('image/')
                ) {
                  return (
                    <div key={index}>
                      <img className="rounded-md w-60" src={part.url} />
                    </div>
                  );
                }
              })}
            </div>
          </div>
        ))}
      </div>

      {messages.length === 0 && <Card type="chat-attachments" />}

      <form
        onSubmit={event => {
          handleSubmit(event, { files });
          setFiles(undefined);

          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
        className="fixed bottom-0 flex flex-col w-full gap-3 p-4 border-t h-28"
      >
        <div className="fixed flex flex-row items-end gap-2 right-8 bottom-32">
          {files
            ? Array.from(files).map(attachment => {
                const { type } = attachment;

                if (type.startsWith('image/')) {
                  return (
                    <div key={attachment.name}>
                      <img
                        className="w-24 rounded-md"
                        src={URL.createObjectURL(attachment)}
                        alt={attachment.name}
                      />
                      <span className="text-sm text-zinc-500">
                        {attachment.name}
                      </span>
                    </div>
                  );
                } else if (type.startsWith('text/')) {
                  return (
                    <div
                      key={attachment.name}
                      className="flex flex-col flex-shrink-0 w-24 gap-1 text-sm text-zinc-500"
                    >
                      <div className="w-16 h-20 rounded-md bg-zinc-100" />
                      {attachment.name}
                    </div>
                  );
                }
              })
            : ''}
        </div>
        <input
          type="file"
          onChange={event => {
            if (event.target.files) {
              setFiles(event.target.files);
            }
          }}
          multiple
          ref={fileInputRef}
        />
        <input
          value={input}
          placeholder="What's the weather in San Francisco?"
          onChange={handleInputChange}
          className="w-full bg-transparent outline-none"
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}
