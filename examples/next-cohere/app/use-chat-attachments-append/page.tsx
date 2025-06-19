'use client';

/* eslint-disable @next/next/no-img-element */
import { getTextFromDataUrl } from '@ai-sdk/ui-utils';
import { useChat } from '@ai-sdk/react';
import { useRef, useState } from 'react';

export default function Page() {
  const { messages, input, setInput, append, status } = useChat({
    api: '/api/chat',
  });

  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 p-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="flex-shrink-0 w-24 text-zinc-500">{`${message.role}: `}</div>

            <div className="flex flex-col gap-2">
              {message.content}

              <div className="flex flex-row gap-2">
                {message.experimental_attachments?.map((attachment, index) =>
                  attachment.contentType?.includes('image/') ? (
                    <img
                      key={`${message.id}-${index}`}
                      className="w-24 rounded-md"
                      src={attachment.url}
                      alt={attachment.name}
                    />
                  ) : attachment.contentType?.includes('text/') ? (
                    <div className="w-32 h-24 p-2 overflow-hidden text-xs border rounded-md ellipsis text-zinc-500">
                      {getTextFromDataUrl(attachment.url)}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={event => {
          event.preventDefault();

          append(
            { role: 'user', content: input },
            {
              experimental_attachments: files,
            },
          );

          setFiles(undefined);
          setInput('');

          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
        className="fixed bottom-0 flex flex-col w-full gap-2 p-2"
      >
        <div className="fixed flex flex-row items-end gap-2 right-2 bottom-14">
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
          placeholder="Send message..."
          onChange={event => {
            setInput(event.target.value);
          }}
          className="w-full p-2 bg-zinc-100"
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}
