'use client';

/* eslint-disable @next/next/no-img-element */
import { useChat } from 'ai/react';
import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Attachment } from '@ai-sdk/ui-utils';

export default function Page() {
  const { messages, input, handleSubmit, handleInputChange, isLoading } =
    useChat({
      api: '/api/chat',
    });

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col p-2 gap-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="w-24 text-zinc-500 flex-shrink-0">{`${message.role}: `}</div>

            <div className="flex flex-col gap-2">
              {message.content}

              <div className="flex flex-row gap-2">
                {message.experimental_attachments?.map((attachment, index) => (
                  <img
                    key={`${message.id}-${index}`}
                    className="w-24 rounded-md"
                    src={attachment.url}
                    alt={attachment.name}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={event => {
          if (isUploading) {
            alert('Please wait for the files to finish uploading.');
            return;
          }

          handleSubmit(event, {
            experimental_attachments: attachments,
          });

          setAttachments([]);

          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
        className="flex flex-col gap-2 fixed bottom-0 p-2 w-full"
      >
        <div className="flex flex-row gap-2 fixed right-2 bottom-14 items-end">
          {Array.from(attachments)
            .filter(attachment => attachment.contentType?.startsWith('image/'))
            .map(attachment => (
              <div key={attachment.name}>
                <img
                  className="w-24 rounded-md"
                  src={attachment.url}
                  alt={attachment.name}
                />
                <span className="text-sm text-zinc-500">{attachment.name}</span>
              </div>
            ))}
        </div>
        <input
          type="file"
          onChange={async event => {
            if (event.target.files) {
              setIsUploading(true);

              for (const file of Array.from(event.target.files)) {
                const blob = await upload(file.name, file, {
                  access: 'public',
                  handleUploadUrl: '/api/files',
                });

                setAttachments(prevAttachments => [
                  ...prevAttachments,
                  {
                    name: file.name,
                    contentType: blob.contentType,
                    url: blob.url,
                  },
                ]);
              }

              setIsUploading(false);
            }
          }}
          multiple
          ref={fileInputRef}
        />
        <input
          value={input}
          placeholder="Send message..."
          onChange={handleInputChange}
          className="bg-zinc-100 w-full p-2"
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
